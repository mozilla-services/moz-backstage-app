import { Router } from 'express';

import { stringifyEntityRef, DEFAULT_NAMESPACE } from '@backstage/catalog-model';
import {
  createRouter,
  defaultAuthProviderFactories,
  providers,
} from '@backstage/plugin-auth-backend';

import { PluginEnvironment } from '../types';

export default async function createPlugin(
  env: PluginEnvironment,
): Promise<Router> {
  return await createRouter({
    logger: env.logger,
    config: env.config,
    database: env.database,
    discovery: env.discovery,
    tokenManager: env.tokenManager,
    providerFactories: {
      ...defaultAuthProviderFactories,

      // This replaces the default GitHub auth provider with a customized one.
      // The `signIn` option enables sign-in for this provider, using the
      // identity resolution logic that's provided in the `resolver` callback.
      //
      // This particular resolver makes all users share a single "guest" identity.
      // It should only be used for testing and trying out Backstage.
      //
      // If you want to use a production ready resolver you can switch to
      // the one that is commented out below, it looks up a user entity in the
      // catalog using the GitHub username of the authenticated user.
      // That resolver requires you to have user entities populated in the catalog,
      // for example using https://backstage.io/docs/integrations/github/org
      //
      // There are other resolvers to choose from, and you can also create
      // your own, see the auth documentation for more details:
      //
      //   https://backstage.io/docs/auth/identity-resolver
      github: providers.github.create({
        signIn: {
          resolver(_, ctx) {
            const userRef = 'user:default/guest'; // Must be a full entity reference
            return ctx.issueToken({
              claims: {
                sub: userRef, // The user's own identity
                ent: [userRef], // A list of identities that the user claims ownership through
              },
            });
          },
          // resolver: providers.github.resolvers.usernameMatchingUserEntityName(),
        },
      }),
      'gcp-iap': providers.gcpIap.create({
        // Replace the auth handler if you want to customize the returned user
        // profile info (can be left out; the default implementation is shown
        // below which only returns the email). You may want to amend this code
        // with something that loads additional user profile data out of e.g.
        // GSuite or LDAP or similar.
        async authHandler({ iapToken }) {
          return { profile: { email: iapToken.email } };
        },
        signIn: {
          // You need to supply an identity resolver, that takes the profile
          // and the IAP token and produces the Backstage token with the
          // relevant user info.
          async resolver({ profile, result: { iapToken } }, ctx) {

            // Somehow compute the Backstage token claims. Just some sample code
            // shown here, but you may want to query your LDAP server, or
            // GSuite or similar, based on the IAP token sub/email claims
            const [id, domain] = iapToken.email.split('@');
            if (domain !== 'mozilla.com') {
              throw new Error(
                `Login failed, this email ${iapToken.email} does not belong to the expected domain`,
              );
            }
            const userEntity = stringifyEntityRef({
              kind: 'User',
              name: id,
              namespace: DEFAULT_NAMESPACE,
            });
            return ctx.issueToken({
              claims: {
                sub: userEntity,
                ent: [userEntity],
              },
            });
            // const sub = stringifyEntityRef({ kind: 'User', name: id });
            // const ent = [
            //   sub,
            //   stringifyEntityRef({ kind: 'Group', name: 'team-name' }),
            // ];
            // return ctx.issueToken({ claims: { sub, ent } });
          },
        },
      }),
    },
  });
}
