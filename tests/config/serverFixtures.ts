/**
 * Copyright 2017 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Fixtures } from '@playwright/test';
import path from 'path';

import { TestServer } from './testserver';

export type ServerWorkerOptions = {
  loopback?: string;
  __servers: ServerFixtures;
};

export type ServerFixtures = {
  server: TestServer;
  httpsServer: TestServer;
};

export const serverFixtures: Fixtures<ServerFixtures, ServerWorkerOptions> = {
  loopback: [undefined, { scope: 'worker', option: true }],
  __servers: [
    async ({ loopback }, run, workerInfo) => {
      const assetsPath = path.join(__dirname, '..', 'assets');
      const cachedPath = path.join(__dirname, '..', 'assets', 'cached');

      const port = 8907 + workerInfo.workerIndex * 4;
      const server = await TestServer.create(assetsPath, port, loopback);
      server.enableHTTPCache(cachedPath);

      const httpsPort = port + 1;
      const httpsServer = await TestServer.createHTTPS(assetsPath, httpsPort, loopback);
      httpsServer.enableHTTPCache(cachedPath);

      await run({
        server,
        httpsServer,
      });

      await Promise.all([server.stop(), httpsServer.stop()]);
    },
    { scope: 'worker' },
  ],

  server: async ({ __servers }, run) => {
    __servers.server.reset();
    await run(__servers.server);
  },

  httpsServer: async ({ __servers }, run) => {
    __servers.httpsServer.reset();
    await run(__servers.httpsServer);
  },
};
