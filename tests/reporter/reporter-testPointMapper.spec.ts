import path from 'path';

import { setHeaders } from '../config/utils';
import azureAreas from './assets/azure-reporter/azureAreas';
import headers from './assets/azure-reporter/azureHeaders';
import location from './assets/azure-reporter/azureLocationOptionsResponse.json';
import { reporterPath } from './reporterPath';
import { expect, test } from './test-fixtures';

const TEST_OPTIONS_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'azureTestOptionsResponse.json'
);
const CORE_OPTIONS_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'azureCoreOptionsResponse.json'
);
const PROJECT_VALID_RESPONSE_PATH = path.join(__dirname, '.', 'assets', 'azure-reporter', 'projectValidResponse.json');
const CREATE_RUN_VALID_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'createRunValidResponse.json'
);
const POINTS_3_VALID_RESPONSE_PATH = path.join(__dirname, '.', 'assets', 'azure-reporter', 'points3Response.json');
const COMPLETE_RUN_VALID_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'completeRunValidResponse.json'
);
const TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH = path.join(
  __dirname,
  '.',
  'assets',
  'azure-reporter',
  'testRunResults3ValidResponse.json'
);

test.describe('TestPointMapper functionality', () => {
  test('testPointMapper can access testCase.tags without undefined errors', async ({ runInlineTest, server }) => {
    server.setRoute('/_apis/Location', (_, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify(location));
    });

    server.setRoute('/_apis/ResourceAreas', (_, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify(azureAreas(server.PORT)));
    });

    server.setRoute('/_apis/Test', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_OPTIONS_RESPONSE_PATH);
    });

    server.setRoute('/_apis/core', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CORE_OPTIONS_RESPONSE_PATH);
    });

    server.setRoute('/_apis/projects/SampleSample', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, PROJECT_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CREATE_RUN_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Points', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, POINTS_3_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = {
          reporter: [
            ['line'],
            ['${reporterPath}', { 
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'SampleSample',
              planId: 4,
              token: 'token',
              logging: true,
              testPointMapper: async (testCase, testPoints) => {
                // Log the testCase properties to verify tags is accessible
                console.log('TESTCASE_PROPS:', JSON.stringify({
                  title: testCase.title,
                  tags: testCase.tags,
                  hasTagsProperty: testCase.tags !== undefined,
                  tagsType: typeof testCase.tags,
                  tagsLength: testCase.tags ? testCase.tags.length : 0
                }));
                
                // Validate that testCase.tags is accessible and not undefined
                if (!testCase.tags) {
                  throw new Error('testCase.tags is undefined - this should not happen after the fix');
                }
                
                // Test the exact logic from the user's example
                const tag = testCase.tags.map((t) => t.toLowerCase());
                const tagOne = tag.includes("@tagone");
                const tagTwo = tag.includes("@tagtwo");

                console.log('TESTPOINTMAPPER_FILTERING:', JSON.stringify({
                  allTags: tag,
                  hasTagOne: tagOne,
                  hasTagTwo: tagTwo
                }));

                if (tagOne && tagTwo) {
                  const filtered = testPoints.filter(
                    (tp) => tp.configuration.id === "3" || tp.configuration.id === "17"
                  );
                  console.log('TESTPOINTMAPPER_RESULT: both tags - filtered', filtered.length, 'points');
                  return filtered;
                } else if (tagOne) {
                  const filtered = testPoints.filter((tp) => tp.configuration.id === "3");
                  console.log('TESTPOINTMAPPER_RESULT: tagOne only - filtered', filtered.length, 'points');
                  return filtered;
                } else if (tagTwo) {
                  const filtered = testPoints.filter((tp) => tp.configuration.id === "17");
                  console.log('TESTPOINTMAPPER_RESULT: tagTwo only - filtered', filtered.length, 'points');
                  return filtered;
                } else {
                  console.log('TESTPOINTMAPPER_RESULT: no matching tags - returning all', testPoints.length, 'points');
                  return testPoints;
                }
              }
            }]
          ]
        };
      `,
        'a.spec.js': `
        import { test, expect } from '@playwright/test';
        test('[3] Test with both tags', { tag: ['@tagOne', '@tagTwo'] }, async () => {
          expect(1).toBe(1);
        });
      `,
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(1);

    // Verify that testCase.tags is accessible and logged correctly
    expect(result.output).toContain('TESTCASE_PROPS:');
    expect(result.output).toContain('"hasTagsProperty":true');
    expect(result.output).toContain('"tagsType":"object"');
    expect(result.output).toContain('"tags":["@tagOne","@tagTwo"]');
    
    // Verify filtering logic worked correctly
    expect(result.output).toContain('TESTPOINTMAPPER_FILTERING:');
    expect(result.output).toContain('"hasTagOne":true');
    expect(result.output).toContain('"hasTagTwo":true');

    // Verify no undefined errors occurred
    expect(result.output).not.toContain('testCase.tags is undefined');
    expect(result.output).not.toContain('Cannot read properties of undefined');
    expect(result.output).not.toContain('TypeError');
  });

  test('testPointMapper handles different tag combinations correctly', async ({ runInlineTest, server }) => {
    server.setRoute('/_apis/Location', (_, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify(location));
    });

    server.setRoute('/_apis/ResourceAreas', (_, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify(azureAreas(server.PORT)));
    });

    server.setRoute('/_apis/Test', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_OPTIONS_RESPONSE_PATH);
    });

    server.setRoute('/_apis/core', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CORE_OPTIONS_RESPONSE_PATH);
    });

    server.setRoute('/_apis/projects/SampleSample', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, PROJECT_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CREATE_RUN_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Points', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, POINTS_3_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = {
          reporter: [
            ['line'],
            ['${reporterPath}', { 
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'SampleSample',
              planId: 4,
              token: 'token',
              logging: true,
              testPointMapper: async (testCase, testPoints) => {
                // Test tag filtering by configuration based on testCase.tags
                const tags = testCase.tags || [];
                const tagOne = tags.some(tag => tag.toLowerCase() === '@tagone');
                const tagTwo = tags.some(tag => tag.toLowerCase() === '@tagtwo');
                
                console.log('TESTCASE_INFO:', JSON.stringify({
                  title: testCase.title,
                  allTags: tags,
                  hasTagOne: tagOne,
                  hasTagTwo: tagTwo,
                  testPointsCount: testPoints.length
                }));

                if (tagOne && tagTwo) {
                  // Return test points for configurations 3 and 17
                  return testPoints.filter(tp => 
                    tp.configuration.id === "3" || tp.configuration.id === "17"
                  );
                } else if (tagOne) {
                  // Return test points for configuration 3 only
                  return testPoints.filter(tp => tp.configuration.id === "3");
                } else if (tagTwo) {
                  // Return test points for configuration 17 only
                  return testPoints.filter(tp => tp.configuration.id === "17");
                } else {
                  // Return all test points for other tags
                  return testPoints;
                }
              }
            }]
          ]
        };
      `,
        'multiple.spec.js': `
        import { test, expect } from '@playwright/test';
        
        // Test with only tagOne - should filter to configuration 3
        test('[3] Test with tagOne only', { tag: ['@tagOne'] }, async () => {
          expect(1).toBe(1);
        });
        
        // Test with only tagTwo - should filter to configuration 17
        test('[3] Test with tagTwo only', { tag: ['@tagTwo'] }, async () => {
          expect(1).toBe(1);
        });
        
        // Test with no relevant tags - should return all test points
        test('[3] Test with other tags', { tag: ['@otherTag'] }, async () => {
          expect(1).toBe(1);
        });
        `
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(3);

    // Verify that filtering worked based on tags
    expect(result.output).toContain('TESTCASE_INFO:');
    expect(result.output).toContain('"hasTagOne":true');
    expect(result.output).toContain('"hasTagTwo":true');
    
    // Verify that tags are properly accessible for all test cases
    expect(result.output).toContain('"allTags":["@tagOne"]');
    expect(result.output).toContain('"allTags":["@tagTwo"]');
    expect(result.output).toContain('"allTags":["@otherTag"]');
    
    // Verify that tags are properly accessible
    expect(result.output).not.toContain('Cannot read properties of undefined');
    expect(result.output).not.toContain('TypeError');
  });

  test('testPointMapper handles edge cases - empty tags, null tags', async ({ runInlineTest, server }) => {
    server.setRoute('/_apis/Location', (_, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify(location));
    });

    server.setRoute('/_apis/ResourceAreas', (_, res) => {
      setHeaders(res, headers);
      res.end(JSON.stringify(azureAreas(server.PORT)));
    });

    server.setRoute('/_apis/Test', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_OPTIONS_RESPONSE_PATH);
    });

    server.setRoute('/_apis/core', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CORE_OPTIONS_RESPONSE_PATH);
    });

    server.setRoute('/_apis/projects/SampleSample', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, PROJECT_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, CREATE_RUN_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Points', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, POINTS_3_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, COMPLETE_RUN_VALID_RESPONSE_PATH);
    });

    server.setRoute('/SampleSample/_apis/test/Runs/150/Results', (req, res) => {
      setHeaders(res, headers);
      server.serveFile(req, res, TEST_RUN_RESULTS_3_VALID_RESPONSE_PATH);
    });

    const result = await runInlineTest(
      {
        'playwright.config.ts': `
        module.exports = {
          reporter: [
            ['line'],
            ['${reporterPath}', { 
              orgUrl: 'http://localhost:${server.PORT}',
              projectName: 'SampleSample',
              planId: 4,
              token: 'token',
              logging: true,
              testPointMapper: async (testCase, testPoints) => {
                // Test edge cases: empty tags, null tags, undefined tags
                console.log('EDGE_CASE_TEST:', JSON.stringify({
                  title: testCase.title,
                  tags: testCase.tags,
                  tagsIsArray: Array.isArray(testCase.tags),
                  tagsLength: testCase.tags ? testCase.tags.length : 'N/A',
                  hasOwnProperty: testCase.hasOwnProperty('tags')
                }));
                
                // Safe access to tags with defensive checks
                const tags = testCase.tags || [];
                const safeTagCheck = tags.length > 0 ? tags[0] : 'no-tags';
                
                console.log('SAFE_TAG_ACCESS:', JSON.stringify({
                  firstTag: safeTagCheck,
                  canMapTags: tags.length > 0,
                  allTagsLowercase: tags.map(t => t.toLowerCase())
                }));
                
                return testPoints; // Return all points for edge case testing
              }
            }]
          ]
        };
      `,
        'edge.spec.js': `
        import { test, expect } from '@playwright/test';
        
        // Test with no tags
        test('[3] Test with no tags', async () => {
          expect(1).toBe(1);
        });
        
        // Test with empty tag array  
        test('[3] Test with empty tags', { tag: [] }, async () => {
          expect(1).toBe(1);
        });
        `
      },
      { reporter: '' }
    );

    expect(result.exitCode).toBe(0);
    expect(result.passed).toBe(2);

    // Verify edge case handling
    expect(result.output).toContain('EDGE_CASE_TEST:');
    expect(result.output).toContain('SAFE_TAG_ACCESS:');
    expect(result.output).toContain('"tagsIsArray":true');
    
    // Verify no undefined errors in edge cases
    expect(result.output).not.toContain('Cannot read properties of undefined');
    expect(result.output).not.toContain('TypeError');
  });
});