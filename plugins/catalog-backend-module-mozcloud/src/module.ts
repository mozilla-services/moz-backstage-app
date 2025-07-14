import * as fs from 'fs/promises';
import * as path from 'path';
import * as YAML from 'yaml';

import {
  coreServices,
  createBackendModule,
  SchedulerServiceTaskRunner,
  LoggerService,
} from '@backstage/backend-plugin-api';

import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node/alpha';

import { ANNOTATION_LOCATION, ANNOTATION_ORIGIN_LOCATION, Entity, GroupEntityV1alpha1, UserEntityV1alpha1 } from '@backstage/catalog-model';
import { EntityProvider, EntityProviderConnection } from '@backstage/plugin-catalog-node';

import { DefaultGithubCredentialsProvider, ScmIntegrations } from '@backstage/integration';

import { Config } from '@backstage/config';

import { Octokit } from '@octokit/rest';

export class MozcloudEntityProvider implements EntityProvider {
  private readonly env: string;
  private connection?: EntityProviderConnection;
  private taskRunner: SchedulerServiceTaskRunner;
  private logger: LoggerService;
  private config: Config;

  constructor(
    env: string,
    taskRunner: SchedulerServiceTaskRunner,
    logger: LoggerService,
    config: Config,
  ) {
    this.env = env;
    this.taskRunner = taskRunner;
    this.logger = logger;
    this.config = config;
  }

  getProviderName(): string {
    return `mozcloud-${this.env}`;
  }

  async connect(connection: EntityProviderConnection): Promise<void> {
    this.connection = connection;

    await this.taskRunner.run({
      id: this.getProviderName(),
      fn: async () => {
        await this.run();
      },
    });
  }

  async run(): Promise<void> {
    if (!this.connection) {
      throw new Error("not initialized");
    }

    let owner = this.config.getString("catalog.providers.mozcloud.entitySourceLocation.owner");
    let repo = this.config.getString("catalog.providers.mozcloud.entitySourceLocation.repo");
    let path = this.config.getString("catalog.providers.mozcloud.entitySourceLocation.path");
    let ref = this.config.getString("catalog.providers.mozcloud.entitySourceLocation.ref");

    // do some github experiments first
    let integrations = ScmIntegrations.fromConfig(this.config);
    let credentialsProvider = DefaultGithubCredentialsProvider.fromIntegrations(integrations);
    let { token } = await credentialsProvider.getCredentials({ url: `https://github.com/${owner}/${repo}`});
    let octokit = new Octokit({ auth: token });

    let response = await octokit.repos.getContent({
      owner: owner,
      repo: repo,
      path: path,
      ref: ref,
    });

    let items = response.data;
    let workgroups = [];

    if (Array.isArray(items)) {
      for (let item of items) {
        if (item.type === "file" && item.name.toLowerCase().endsWith("yaml")) {
          this.logger.info(`.. fetching file: ${item.name}`);

          let fileResponse = await octokit.repos.getContent({
            owner: owner,
            repo: repo,
            path: item.path,
            ref: ref,
          });

          let content = Buffer.from((fileResponse.data as any).content, "base64").toString("utf-8");
          let workgroup = YAML.parse(content);

          workgroups.push(workgroup);
        }
      }
    }

    let workgroup_emails = new Map();

    for (let workgroup of workgroups) {
      workgroup_emails.set(workgroup.workgroup, new Map());

      for (let subgroup of workgroup.subgroups) {
        workgroup_emails.get(workgroup.workgroup).set(subgroup.name, subgroup.members ?? []);
      }
    }

    for (let workgroup of workgroups) {
      for (let subgroup of workgroup.subgroups) {
        for (let subworkgroup of subgroup.workgroups ?? []) {
          let parts = subworkgroup.split("/");

          for (let email of workgroup_emails.get(parts[0]).get(parts[1])) {
            workgroup_emails.get(workgroup.workgroup).get(subgroup.name).push(email);
          }
        }
      }
    }

    // build group resources
    let groupResources = new Map();

    for (let workgroup of workgroup_emails.keys()) {
      let groupEntity: GroupEntityV1alpha1 = {
        apiVersion: "backstage.io/v1alpha1",
        kind: "Group",
        metadata: {
          annotations: {
            [ANNOTATION_LOCATION]: `mozcloud-workgroup:https://github.com/mozilla/global-platform-admin/blob/main/google-workspace-management/tf/workgroups/${workgroup}.yaml`,
            [ANNOTATION_ORIGIN_LOCATION]: `mozcloud-workgroup:https://github.com/mozilla/global-platform-admin/blob/main/google-workspace-management/tf/workgroups/${workgroup}.yaml`,
          },
          name: workgroup,
        },
        spec: {
          type: "mozcloud-workgroup",
          profile: {
            displayName: workgroup,
          },
          children: [],
        },
      };

      groupResources.set(workgroup, groupEntity);

      for (let subgroup of workgroup_emails.get(workgroup).keys()) {
        groupResources.get(workgroup).spec.children.push(`${workgroup}--${subgroup}`);
        
        let subgroupEntity: GroupEntityV1alpha1 = {
          apiVersion: "backstage.io/v1alpha1",
          kind: "Group",
          metadata: {
            annotations: {
              [ANNOTATION_LOCATION]: `mozcloud-workgroup:https://github.com/mozilla/global-platform-admin/blob/main/google-workspace-management/tf/workgroups/${workgroup}.yaml`,
              [ANNOTATION_ORIGIN_LOCATION]: `mozcloud-workgroup:https://github.com/mozilla/global-platform-admin/blob/main/google-workspace-management/tf/workgroups/${workgroup}.yaml`,
            },
            name: `${workgroup}--${subgroup}`,
          },
          spec: {
            type: "mozcloud-workgroup",
            profile: {
              displayName: `${workgroup}--${subgroup}`,
            },
            children: [],
          },
        };

        groupResources.set(`${workgroup}--${subgroup}`, subgroupEntity)
      }
    }

    // build user resources
    let userResources = new Map();

    for (let workgroup of workgroup_emails.keys()) {
      for (let subgroup of workgroup_emails.get(workgroup).keys()) {
        for (let email of workgroup_emails.get(workgroup).get(subgroup)) {
          let parts = email.split("@");

          if (!userResources.has(parts[0])) {
            let userEntity: UserEntityV1alpha1 = {
              apiVersion: "backstage.io/v1alpha1",
              kind: "User",
              metadata: {
                annotations: {
                  [ANNOTATION_LOCATION]: `mozcloud-user:https://people.mozilla.org/s?query=${email}&who=staff`,
                  [ANNOTATION_ORIGIN_LOCATION]: `mozcloud-user:https://people.mozilla.org/s?query=${email}&who=staff`,
                },
                name: parts[0],
              },
              spec: {
                profile: {
                  displayName: parts[0],
                  email: email,
                },
                memberOf: [
                  `${workgroup}--${subgroup}`,
                ],
              },
            };

            userResources.set(parts[0], userEntity);
          } else {
            userResources.get(parts[0]).spec.memberOf.push(`${workgroup}--${subgroup}`);
          }
        }
      }
    }

    this.logger.info(`found ${groupResources.size} mozcloud workgroups`)
    this.logger.info(`found ${userResources.size} mozcloud users`)

    let allEntities = Array.from(groupResources.values()).concat(Array.from(userResources.values())).map(entity => ({
      entity, locationKey: `mozcloud-provider:${this.env}`,
    }));

    await this.connection.applyMutation({
      type: "full",
      entities: allEntities,
    });
  }
}


export const catalogModuleMozcloud = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'mozcloud',
  register(reg) {
    reg.registerInit({
      deps: {
        logger: coreServices.logger,
        catalog: catalogProcessingExtensionPoint,
        scheduler: coreServices.scheduler,
        config: coreServices.rootConfig,
      },
      async init({ logger, catalog, scheduler, config }) {
        const taskRunner = scheduler.createScheduledTaskRunner({
          frequency: { seconds: 30 },
          timeout: { seconds: 10 },
        });

        const mozcloud = new MozcloudEntityProvider("dev", taskRunner, logger, config);
        catalog.addEntityProvider(mozcloud);
      },
    });
  },
});
