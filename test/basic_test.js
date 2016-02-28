'use strict';

import 'babel/polyfill'
import vertexData from './data/vertices'
import edgeData from './data/edges'
import assert from 'assert';
import arangojs, {Database, aqlQuery} from 'arangojs';
import {
  attributeToVertex,
  createVertex,
  removeAttribute
} from '../src/main'

describe('Test setup', () => {

  let db = arangojs({databaseName: "test", url: "http://localhost:8529"})

  beforeEach(async () => {
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

  afterEach(() => db.truncate())

  let vertexLike = async (example) => {
    let aql = aqlQuery`
      FOR v IN vertices FILTER MATCHES(v, ${example}) RETURN v
    `
    let cursor = await db.query(aql)
    return cursor.all()
  }

  it('can reify an attribute with and inbound edge', async () => {
    //transform the test data by reifying founding_year
    await attributeToVertex({founding_year: 2004}, {direction: "inbound", additional_attrs: {}})
    //get the new vertex
    let newVertex = await vertexLike({founding_year: 2004})
    //Can we walk inbound edges and reach shopify?
    let aql = aqlQuery`FOR v, e, p IN INBOUND ${newVertex[0]} GRAPH "test" RETURN v`
    let result = await db.query(aql)
    let reachableVertex = await result.next()
    assert.equal("Shopify", reachableVertex.name)
  })

  it('can reify an attribute with and outbound edge', async () => {
    //transform the test data by reifying founding_year
    await attributeToVertex({founding_year: 2004}, {direction: "outbound", additional_attrs: {}})
    //get the new vertex
    let newVertex = await vertexLike({founding_year: 2004})
    //Can we walk inbound edges and reach shopify?
    let aql = aqlQuery`FOR v, e, p IN OUTBOUND ${newVertex[0]} GRAPH "test" RETURN v`
    let result = await db.query(aql)
    let reachableVertex = await result.next()
    assert.equal("Shopify", reachableVertex.name)
  })

  describe("createVertex", () => {
    it("creates a vertex in the specified collection", async () => {
      let vertex = await createVertex({foo: "bar"}, "vertices")
      assert.equal("bar", vertex[0].foo)
      assert.notEqual(null, vertex[0]._id)
    })
  })

  describe("removeAttribute", () => {
    it("creates a vertex in the specified collection", async () => {
      let vertexWith = await createVertex({foo: "bar"}, "vertices")
      let vertexWithout = await removeAttribute({foo: "bar"}, "vertices")
      assert.equal(vertexWith[0]._id, vertexWithout[0]._id)
      assert.equal("bar", vertexWith[0].foo)
      assert.equal(null, vertexWithout[0].foo)
    })
  })


});

