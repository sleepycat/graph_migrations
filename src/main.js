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

  var action = String((args) => {

    var db = require("internal").db;

    var example = args[0]
    var options = args[1]

    if(options.additional_attrs){
      var additional_vertex_attributes = options.additional_attrs.vertex
      var additional_edge_attributes = options.additional_attrs.edge
    } else {
      var additional_vertex_attributes = {}
      var additional_edge_attributes = {}
    }

    var removeAttributesAQL = `
      FOR vertex IN vertices
      FILTER MATCHES(vertex, @example)
      REPLACE vertex WITH UNSET(vertex, ATTRIBUTES(@example)) IN @@collection
      RETURN NEW
    `
    //All the vertices that have had an attribute removed
    var verticesWithAttrsRemoved = db._query(removeAttributesAQL, {example: example, "@collection": "vertices"}).toArray()

    var createVertexAQL = `
    INSERT MERGE(@attrs, @additional_attrs)
    IN @@collection
      RETURN NEW
    `
    var newVertex = db._query(createVertexAQL, {attrs: example, additional_attrs: additional_vertex_attributes, "@collection": "vertices"}).toArray()[0]

    //verticesWithAttrsRemoved is an array of all the documents we removed the
    //attribute from.
    //Now we create edges either to or from all the vertices we removed
    //the attribute from to the newly created vertex
    if(options.direction == "inbound") {
      var createEdgesAQL = `
      FOR vertex IN @verticesWithAttrsRemoved
        LET merged = (MERGE({ _to: @newVertexID, _from: vertex._id }, @additional_attrs))
        INSERT merged
        IN @@collection
          RETURN NEW
      `
    } else {
      var createEdgesAQL = `
      FOR vertex IN @verticesWithAttrsRemoved
        LET merged = (MERGE({ _from: @newVertexID, _to: vertex._id }, @additional_attrs))
        INSERT merged
        IN @@collection
          RETURN NEW
      `
    }
    var edges = db._query(createEdgesAQL, {verticesWithAttrsRemoved: verticesWithAttrsRemoved, additional_attrs: additional_edge_attributes,  newVertexID: newVertex._id, "@collection": 'edges'}).toArray()

    //In theory all went well.
    return newVertex
  })
  await db.transaction({write: ['vertices', 'edges']}, action, [example, options])
};

module.exports.attributeToVertex = attributeToVertex;
