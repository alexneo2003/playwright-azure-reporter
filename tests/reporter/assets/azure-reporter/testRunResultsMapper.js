export default function testRunResultsMapper(body) {
  return {
    count: body.length,
    value: body.map((_, i) => {
      return {
        id: (100000 + i).toString(),
        project: {},
        outcome: 'Passed',
        testRun: {
          id: '150',
        },
        priority: 0,
        url: '',
        lastUpdatedBy: {
          displayName: null,
          id: null,
        },
      };
    }),
  };
}

/**
 * body sample:
 * [
    {
      "testPoint": {
        "id": "3"
      },
      "outcome": "Passed",
      "state": "Completed",
      "durationInMs": 11
    },
    {
      "testPoint": {
        "id": "4"
      },
      "outcome": "Passed",
      "state": "Completed",
      "durationInMs": 2
    },
 */

/**
 * response sample:
 * {
    "count": 1,
    "value": [
      {
        "id": 100001,
        "project": {},
        "outcome": "Passed",
        "testRun": {
          "id": "150"
        },
        "priority": 0,
        "url": "",
        "lastUpdatedBy": {
          "displayName": null,
          "id": null
        }
      }
    ]
  }
 */
