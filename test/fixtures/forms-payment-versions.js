export const formPaymentVersions = {
  1: {
    name: 'Payment form',
    startPage: '/page-one',
    pages: [
      {
        path: '/page-one',
        title: 'Your details',
        section: 'details',
        components: [
          {
            name: 'fullName',
            title: 'Full name',
            type: 'TextField',
            options: {}
          },
          {
            name: 'email',
            title: 'Email address',
            type: 'EmailAddressField',
            options: {}
          }
        ],
        next: [
          {
            path: '/summary'
          }
        ]
      },
      {
        path: '/summary',
        title: 'Summary',
        controller: './pages/summary.js'
      }
    ],
    conditions: [],
    sections: [
      {
        name: 'details',
        title: 'Your details'
      }
    ],
    lists: [],
    phaseBanner: {
      phase: 'beta'
    },
    metadata: {}
  }
}
