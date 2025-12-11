export const auth = {
  strategy: 'azure-oidc-token',
  credentials: {
    user: {
      aud: 'api://2bf2d9fd-fe1e-47eb-9821-b6f6cd3ceba1',
      iss: 'https://sts.windows.net/5b504113-6b64-43f2-ade9-242e05780008/',
      family_name: 'Chase',
      given_name: 'Enrique',
      groups: ['7049296f-2156-4d61-8ac3-349276438ef9'],
      name: 'Enrique Chase (Defra)',
      scp: 'forms.user',
      sub: 'hgtL_1p2Me5JkBB6JeB20PyU3YDuP9PjEZwi7m1QGng',
      oid: '86758ba9-92e7-4287-9751-7705e449688e'
    }
  }
}

export const appAuth = {
  strategy: 'cognito-access-token',
  credentials: {
    app: {
      sub: '14f14577-f400-42fd-be31-945a05c7149d',
      iss: 'https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_abcdef123',
      version: 2,
      client_id: '6v87ae6bg5tltqsdfe3icgjv',
      origin_jti: '86b9a270-b7c3-44eb-93f3-b59fa4e9fd6d',
      event_id: '54945e65-e73c-4fcc-b8d1-371e2e121693',
      token_use: 'access',
      scope: 'openid email',
      auth_time: 1765297268,
      exp: 1765300868,
      iat: 1765297268,
      jti: '28999373-d1bb-4595-ad00-c6d9daac54f9',
      username: '14f14577-f400-42fd-be31-945a05c7149d'
    }
  }
}
