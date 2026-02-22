import test from 'node:test';
import assert from 'node:assert/strict';
import { exportPostmanCollection, importPostmanCollection } from './postman.js';

const samplePostman = {
  info: {
    name: 'Demo',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: {
    type: 'bearer',
    bearer: [{ key: 'token', value: '{{token}}' }],
  },
  item: [
    {
      name: 'Users',
      item: [
        {
          name: 'Admin',
          auth: {
            type: 'apikey',
            apikey: [
              { key: 'key', value: 'x-api-key' },
              { key: 'value', value: '{{adminKey}}' },
            ],
          },
          item: [
            {
              name: 'Create User',
              request: {
                method: 'POST',
                url: {
                  raw: 'https://{{host}}/users',
                  query: [{ key: 'env', value: '{{env}}' }],
                },
                body: {
                  mode: 'raw',
                  raw: '{"name":"{{name}}"}',
                  options: { raw: { language: 'json' } },
                },
              },
            },
          ],
        },
      ],
    },
    {
      name: 'Login',
      request: {
        method: 'POST',
        url: 'https://{{host}}/login',
        body: {
          mode: 'urlencoded',
          urlencoded: [{ key: 'username', value: '{{user}}' }],
        },
      },
    },
    {
      name: 'Upload',
      request: {
        method: 'POST',
        url: 'https://{{host}}/upload',
        body: {
          mode: 'formdata',
          formdata: [{ key: 'meta', value: '{{meta}}' }],
        },
      },
    },
  ],
};

test('imports nested folders and auth inheritance', () => {
  const collection = importPostmanCollection(JSON.stringify(samplePostman));

  assert.equal(collection.folders.length, 1);
  assert.equal(collection.folders[0].folders[0].name, 'Admin');

  const createUser = collection.folders[0].folders[0].requests[0];
  assert.equal(createUser.auth?.type, 'apikey');

  const login = collection.requests.find((entry) => entry.name === 'Login');
  assert.equal(login?.auth?.type, 'bearer');
});

test('imports request body modes and variable placeholders', () => {
  const collection = importPostmanCollection(JSON.stringify(samplePostman));

  const createUser = collection.folders[0].folders[0].requests[0];
  assert.equal(createUser.definition.body.mode, 'raw');
  assert.equal(createUser.definition.body.content, '{"name":"{{name}}"}');

  const login = collection.requests.find((entry) => entry.name === 'Login');
  assert.equal(login?.definition.body.mode, 'x-www-form-urlencoded');
  assert.deepEqual(login?.definition.body.content, { username: '{{user}}' });

  const upload = collection.requests.find((entry) => entry.name === 'Upload');
  assert.equal(upload?.definition.body.mode, 'form-data');
  assert.deepEqual(upload?.definition.body.content, { meta: '{{meta}}' });
});

test('exports internal collection to postman v2.1 compatible json', () => {
  const collection = importPostmanCollection(JSON.stringify(samplePostman));
  const exported = exportPostmanCollection(collection);

  assert.equal(exported.info?.schema, 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json');
  assert.equal(exported.item?.[0].name, 'Users');

  const login = exported.item?.find((entry) => entry.name === 'Login');
  assert.equal(login?.request?.body?.mode, 'urlencoded');
  assert.equal(login?.request?.url && typeof login.request.url !== 'string' ? login.request.url.raw : '', 'https://{{host}}/login');
});
