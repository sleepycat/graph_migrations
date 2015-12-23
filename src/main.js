'use strict';

import arangojs, {Database, aqlQuery} from 'arangojs';

let db = arangojs({databaseName: "test", url: "http://localhost:8529"})

let createVertex = async (attrs, collection) => {
  //FIXME: use the collection variable
  //insert a new vertex for the attribute
  let insertionQuery = aqlQuery`
    UPSERT ${attrs}
      INSERT ${attrs}
      UPDATE {}
      IN vertices
        RETURN NEW
  `
  let insertionCursor = await db.query(insertionQuery)
  return insertionCursor.all()
}

module.exports.createVertex = createVertex;

let removeAttribute = async (example, collection) => {
  //Then remove the attribute from existing vertices
  //FIXME: use the collection variable
  let aql = aqlQuery`
    FOR vertex IN vertices
      FILTER MATCHES(vertex, ${example})
        REPLACE vertex WITH UNSET(vertex, ATTRIBUTES(${example})) IN vertices
          RETURN NEW
  `
  let cursor = await db.query(aql)
  return cursor.all()
}

module.exports.removeAttribute = removeAttribute;

let attributeToVertex = async (example, options) => {
  //TODO: this is pretty terrible.

  let vertexCollection = await db.collection('vertices')
  let edgesCollection = await db.edgeCollection('edges')

  //FIXME: collection arg is not used currently
  let oldVertices = await removeAttribute(example, "vertices")

  //FIXME: collection arg is not used currently
  let newVertex = await createVertex(example, "vertices")
  let newVertexID = newVertex[0]._id

  //oldVertices is an array of all the documents we removed the
  //attribute from.
  //Now we create edges either to or from all the vertices we removed
  //the attribute from to the newly created vertex
  if(options.direction == "inbound") {
    console.log( options.direction )
    let edgeQuery = aqlQuery`
    FOR vertex IN ${oldVertices}
      UPSERT { _to: ${newVertexID}, _from: vertex._id }
      INSERT { _to: ${newVertexID}, _from: vertex._id }
      UPDATE {}
        IN edges
          RETURN NEW
    `
    let cursor = await db.query(edgeQuery)
    let edges = await cursor.all()
  } else {
    let edgeQuery = aqlQuery`
    FOR vertex IN ${oldVertices}
      UPSERT { from: ${newVertexID}, _to: vertex._id }
      INSERT { _from: ${newVertexID}, _to: vertex._id }
      UPDATE {}
        IN edges
          RETURN NEW
    `
    let cursor = await db.query(edgeQuery)
    let edges = await cursor.all()
  }

  //In theory all went well.
  return true
}

let vertexToAttribute = () => {
  return "vertex to attribute"
}

module.exports.attributeToVertex = attributeToVertex;
