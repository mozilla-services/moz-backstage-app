import { createBackendModule } from '@backstage/backend-plugin-api';
import { gcpIapAuthenticator } from '@backstage/plugin-auth-backend-module-gcp-iap-provider';
import {
  authProvidersExtensionPoint,
  createProxyAuthProviderFactory,
} from '@backstage/plugin-auth-node';

export const gcpIapCustomAuth = createBackendModule({
  pluginId: 'auth',
  moduleId: 'custom-gcp-iap-auth-provider',
  register(reg) {
    reg.registerInit({
      deps: { providers: authProvidersExtensionPoint },
      async init({ providers }) {
        providers.registerProvider({
          providerId: 'gcpIap',
          factory: createProxyAuthProviderFactory({
            authenticator: gcpIapAuthenticator,
            async signInResolver(info, ctx) {
              const {
                profile: { email },
              } = info;

              if (!email) {
                throw new Error('User profile contained no email');
              }

              const [name, domain] = email.split('@');
              if (domain !== 'mozilla.com') {
                throw new Error(`Login failed, this email ${email} does not belong to the expected domain`,)
              }

              // This helper function handles sign-in by looking up a user in the catalog.
              // The lookup can be done either by reference, annotations, or custom filters.
              //
              // The helper also issues a token for the user, using the standard group
              // membership logic to determine the ownership references of the user.
              return ctx.signInWithCatalogUser({
                entityRef: { name },
              });
            },
          }),
        });
      },
    });
  },
});
