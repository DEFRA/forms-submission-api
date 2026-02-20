export const buildArtifactStub = function (partialpayload = {}) {
  return {
    token: 'eyJrjwt...',
    raw: {
      header: 'eyJraW',
      payload: 'eyJzdWIi',
      signature: 'pNNv...'
    },
    decoded: {
      header: {
        alg: 'RS256',
        kid: 'amhKOdpPMacPs5='
      },
      payload: {
        aud: '2b7b41bf-7f92-4aeb-9b05-7e8a30f86ec2',
        iss: 'https://login.microsoftonline.com/bdd7c0af-1c2c-4158-b743-55e21ad02a9e/v2.0',
        iat: 1765443559,
        nbf: 1765443559,
        exp: 1765448056,
        aio: 'AYQAe',
        azp: '2b7b41bf-7f92-4aeb-9b05-7e8a30f86ec2',
        azpacr: '1',
        family_name: 'Chase',
        given_name: 'Enrique',
        groups: ['7049296f-2156-4d61-8ac3-349276438ef9'],
        login_hint: 'O.CiQ',
        name: 'Enrique Chase (Defra)',
        oid: '396e84b4-1cbd-40d0-af83-857be2aaefa7',
        preferred_username: 'Enrique.Chase@defradev.onmicrosoft.com',
        rh: '1.AToAE.',
        scp: 'forms.user',
        sid: 'ec5ab3a9-5b3d-4b0c-8c76-5f84670d60dd',
        sub: 'hjtL_2p2Me5JkBB6JeB20PyU3YDuP9PjEZwi7m1QHmg',
        tid: 'bdd7c0af-1c2c-4158-b743-55e21ad02a9e',
        uti: 'h6bvE-aex0a2KlkyjpYaAA',
        ver: '2.0',
        xms_ftd: 'Dva91E',
        ...partialpayload
      },
      signature: 'pNNvCHFI7uz0Sj'
    }
  }
}
