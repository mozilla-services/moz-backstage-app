import {
  AnalyticsApi,
  AnalyticsEvent,
  AnyApiFactory,
  ConfigApi,
  analyticsApiRef,
  configApiRef,
  createApiFactory,
} from '@backstage/core-plugin-api';

import Glean from '@mozilla/glean/web';
import GleanMetrics from '@mozilla/glean/metrics';
import { JsonObject } from '@backstage/types';
import { create } from './metrics/backstage';

interface DebugConfig extends JsonObject {
  logging?: boolean,
  tag?: string,
}

export class GleanAnalytics implements AnalyticsApi {
  private constructor(appId: string, enabled: boolean, config: object, debug?: DebugConfig) {
    if (debug) {
      Glean.setLogPings(!!debug.logging);
      Glean.setDebugViewTag(debug.tag || '');
    }
    Glean.initialize(appId, enabled, config);
  }

  static fromConfig(config: ConfigApi): GleanAnalytics {
    const appId = config.getString('app.analytics.glean.appId');
    const enabled = config.getBoolean('app.analytics.glean.enabled');
    const debug = config.getOptional('app.analytics.glean.debug') as DebugConfig;
    const environment = config.getString('app.analytics.glean.environment');
    return new GleanAnalytics(appId, enabled, {
      enableAutoPageLoadEvents: false,
      enabledAutoElementClickEvents: false,
      channel: environment,
    }, debug);
  }

  captureEvent(event: AnalyticsEvent) {
    const { action, subject } = event;
    switch (action) {
      case 'navigate':
        GleanMetrics.pageLoad({
          title: subject,
          url: window.location.toString(),
          referrer: document.referrer,
        });
        break;
      case 'click':
        GleanMetrics.recordElementClick({
          id: event.attributes?.to.toString(),
          label: subject,
        })
        break;
      case 'create':
        create.record({
          name: subject,
          entity_ref: event.attributes?.entityRef.toString(),
          time_saved: event.value,
        })
        break;

      default:
        break;
    }
  }
}

export const createGleanApiFactory: () => AnyApiFactory = () =>
  createApiFactory({
    api: analyticsApiRef,
    deps: { configApi: configApiRef },
    factory: ({ configApi }) => GleanAnalytics.fromConfig(configApi),
  });
