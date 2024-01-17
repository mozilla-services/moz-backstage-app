import { CatalogBuilder } from '@backstage/plugin-catalog-backend';
import { GithubEntityProvider } from '@backstage/plugin-catalog-backend-module-github';
import { GithubMultiOrgEntityProvider } from '@backstage/plugin-catalog-backend-module-github';
import { ScaffolderEntitiesProcessor } from '@backstage/plugin-scaffolder-backend';
import { Router } from 'express';
import { PluginEnvironment } from '../types';

export default async function createPlugin(
  env: PluginEnvironment,
): Promise<Router> {
  const builder = await CatalogBuilder.create(env);
  // GitHub Entity provider without events support
  builder.addEntityProvider(
    GithubEntityProvider.fromConfig(env.config, {
      logger: env.logger,
      scheduler: env.scheduler,
    }),
  );
  // GitHub Org Provider without events support
  builder.addEntityProvider(
    GithubMultiOrgEntityProvider.fromConfig(env.config, {
      id: 'production',
      githubUrl: 'https://github.com',
      // Set the following to list the GitHub orgs you wish to ingest from. You can
      // also omit this option to ingest all orgs accessible by your GitHub integration
      orgs: ['mozilla-services', 'mozilla'],
      logger: env.logger,
      schedule: env.scheduler.createScheduledTaskRunner({
        frequency: { minutes: 15 },
        timeout: { minutes: 5 },
      }),
    }),
  );
  builder.addProcessor(new ScaffolderEntitiesProcessor());
  const { processingEngine, router } = await builder.build();
  await processingEngine.start();
  return router;
}
