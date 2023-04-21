export default function pointsResponseMapper(body) {
  /**
   * body sample request:
   * {
   *  "pointsFilter": {
   *   "testcaseIds": [
   *    1,
   *    2,
   *    3
   *  ],
   * }
   */

  const { pointsFilter } = body;
  const { testcaseIds } = pointsFilter;
  const testPointsArray = Array.from({ length: testcaseIds.length }, (_, i) => {
    return {
      id: 1 + i,
      url: 'http://localhost:3000/SampleSample/_apis/test/Plans/4/Suites/6/Points/' + (i + 1 * 3),
      assignedTo: {
        displayName: 'Alex',
        id: '230e55b4-9e71-6a10-a0fa-777777777',
      },
      automated: false,
      configuration: {
        id: '1',
        name: 'Windows 10',
      },
      lastTestRun: {
        id: '238',
      },
      lastResult: {
        id: (100000 + i).toString(),
      },
      outcome: 'Passed',
      state: 'Completed',
      lastResultState: 'Completed',
      suite: {
        id: '6',
      },
      testCase: {
        id: testcaseIds[i],
      },
      testPlan: {
        id: '4',
      },
      workItemProperties: [
        {
          workItem: {
            key: 'Microsoft.VSTS.TCM.AutomationStatus',
            value: 'Not Automated',
          },
        },
      ],
    };
  });

  return {
    points: testPointsArray,
    pointsFilter,
  };
}

/**
 * response sample:
 * {
  "points": [
      {
        "id": 1,
        "url": "http://localhost:3000/SampleSample/_apis/test/Plans/4/Suites/6/Points/1",
        "assignedTo": {
          "displayName": "Alex",
          "id": "230e55b4-9e71-6a10-a0fa-777777777"
        },
        "automated": false,
        "configuration": {
          "id": "1",
          "name": "Windows 10"
        },
        "lastTestRun": {
          "id": "238"
        },
        "lastResult": {
          "id": "100000"
        },
        "outcome": "Passed",
        "state": "Completed",
        "lastResultState": "Completed",
        "suite": {
          "id": "6"
        },
        "testCase": {
          "id": "3"
        },
        "testPlan": {
          "id": "4"
        },
        "workItemProperties": [
          {
            "workItem": {
              "key": "Microsoft.VSTS.TCM.AutomationStatus",
              "value": "Not Automated"
            }
          }
        ]
      }
    ],
    "pointsFilter": {
      "testcaseIds": [3]
    }
  }

 */
