'use strict';

import 'babel/polyfill'
import vertexData from './data/vertices'
import edgeData from './data/edges'
import assert from 'assert';
import arangojs, {Database, aqlQuery} from 'arangojs';

describe('Test setup', () => {

  let db = arangojs({databaseName: "test", url: "http://localhost:8529"})

  before(async () => {
    let vertexCollection = await db.collection('vertices')
    let edgesCollection = await db.edgeCollection('edges')
    try {
      await vertexCollection.create()
      await edgesCollection.create()
    }
    catch (e) {
      // The collection exists already
    }
    // import the test data
    await vertexCollection.import(vertexData);
    await edgesCollection.import(edgeData)
  })

  it('can query the test data', async () => {
    //There are 23 vertices in test/data/vertices.js
    let aql = aqlQuery`
      RETURN LENGTH(vertices)
    `
    let cursor = await db.query(aql)
    let results = await cursor.all()
    assert.equal(23, results[0]);
  });

});

