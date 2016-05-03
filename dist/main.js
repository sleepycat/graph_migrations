'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

Object.defineProperty(exports, "__esModule", {
  value: true
});

require('babel-polyfill');

var _arangojs = require('arangojs');

var _arangojs2 = _interopRequireDefault(_arangojs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { return step("next", value); }, function (err) { return step("throw", err); }); } } return step("next"); }); }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var GraphMigration = function () {
  function GraphMigration(databaseName) {
    var url = arguments.length <= 1 || arguments[1] === undefined ? "http://localhost:8529" : arguments[1];

    _classCallCheck(this, GraphMigration);

    if (typeof databaseName == 'undefined') throw new Error('You must provide a database name');
    this.db = (0, _arangojs2.default)({ databaseName: databaseName, url: url });
  }

  _createClass(GraphMigration, [{
    key: 'databaseName',
    value: function databaseName() {
      return this.db.name;
    }
  }, {
    key: '_describeGraph',
    value: function () {
      var ref = _asyncToGenerator(regeneratorRuntime.mark(function _callee(graphName) {
        var graph;
        return regeneratorRuntime.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                _context.next = 2;
                return this.db.graph(graphName);

              case 2:
                graph = _context.sent;
                _context.next = 5;
                return graph.get();

              case 5:
                return _context.abrupt('return', _context.sent);

              case 6:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      return function _describeGraph(_x2) {
        return ref.apply(this, arguments);
      };
    }()
  }, {
    key: 'allCollections',
    value: function () {
      var ref = _asyncToGenerator(regeneratorRuntime.mark(function _callee2(graphName) {
        var collections, graphDescription;
        return regeneratorRuntime.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                collections = [];
                _context2.next = 3;
                return this._describeGraph(graphName);

              case 3:
                graphDescription = _context2.sent;

                graphDescription.edgeDefinitions.forEach(function (edgeDef) {
                  collections.push(edgeDef.collection);
                  //XXX: this means we are not allowing edge collections that point to
                  //more than one document collection
                  collections.push(edgeDef.to[0]);
                  collections.push(edgeDef.from[0]);
                });
                return _context2.abrupt('return', Array.from(new Set(collections)));

              case 6:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      return function allCollections(_x3) {
        return ref.apply(this, arguments);
      };
    }()
  }, {
    key: 'redirectEdges',
    value: function () {
      var ref = _asyncToGenerator(regeneratorRuntime.mark(function _callee3(start, target, graphName, options) {
        var action;
        return regeneratorRuntime.wrap(function _callee3$(_context3) {
          while (1) {
            switch (_context3.prev = _context3.next) {
              case 0:
                action = String(function (args) {

                  var db = require("internal").db;
                  var graph_module = require("@arangodb/general-graph");
                  //TODO: make sure these are the types we think
                  var source = args[0];
                  var destination = args[1];
                  var graphName = args[2];
                  var options = args[3];
                  options.edge_example = typeof options.edge_example === 'undefined' ? {} : options.edge_example;

                  var resultset = [];

                  //Our neighbor is the new target for these edges
                  if (options.direction == "inbound") {
                    //GRAPH_* functions let us get things from the graph without
                    //knowledge of the collection they live in.
                    //But there is no way to find and reference the collection a
                    //document is from if all you have is the document itself.
                    //So first we get the edges:
                    var inboundEdgesAQL = '\n        FOR edge IN GRAPH_EDGES(@graph, @src, {includeData: true, direction: "inbound"})\n        FILTER edge._to != @dst._id || edge._from != @dst._id\n          RETURN edge\n        ';
                    var inboundEdges = db._query(inboundEdgesAQL, { graph: graphName, src: source, dst: destination }).toArray();

                    //With edges in hand we split the collection name out of the id:
                    inboundEdges.forEach(function (edge) {
                      var collection = edge._id.split("/")[0];
                      //delete the existing edge
                      var removeInboundEdgeAQL = '\n             REMOVE @edge IN @@collection\n          ';
                      db._query(removeInboundEdgeAQL, { edge: edge, "@collection": collection }).toArray()[0];
                      //And then edit the edge in it's collection like a regular document:
                      var createInboundEdgeAQL = '\n          INSERT @edge IN @@collection RETURN NEW\n         ';
                      edge._to = destination._id;
                      delete edge._id;
                      delete edge._key;
                      delete edge._rev;
                      var opt = { edge: edge, "@collection": collection };

                      var attributes = db._query(createInboundEdgeAQL, opt).toArray()[0];
                    });

                    resultset.push(destination);
                  }

                  if (options.direction == "outbound") {
                    var outboundEdgesAQL = '\n        FOR edge IN GRAPH_EDGES(@graph, @src, {includeData: true, direction: "outbound"})\n        FILTER edge._to != @dst._id || edge._from != @dst._id\n          RETURN edge\n        ';
                    var outboundEdges = db._query(outboundEdgesAQL, { graph: graphName, src: source, dst: destination }).toArray();

                    //With edges in hand we split the collection name out of the id:
                    outboundEdges.forEach(function (edge) {
                      var collection = edge._id.split("/")[0];
                      //delete the existing edge
                      var removeOutboundEdgeAQL = '\n             REMOVE @edge IN @@collection\n          ';
                      db._query(removeOutboundEdgeAQL, { edge: edge, "@collection": collection }).toArray()[0];
                      //And then edit the edge in it's collection like a regular document:
                      var createOutboundEdgeAQL = '\n          INSERT @edge IN @@collection RETURN NEW\n         ';
                      edge._from = destination._id;
                      delete edge._id;
                      delete edge._key;
                      delete edge._rev;
                      var opt = { edge: edge, "@collection": collection };

                      var attributes = db._query(createOutboundEdgeAQL, opt).toArray()[0];
                    });

                    resultset.push(destination);
                  }

                  return resultset;
                });
                _context3.t0 = this.db;
                _context3.next = 4;
                return this.allCollections(graphName);

              case 4:
                _context3.t1 = _context3.sent;
                _context3.t2 = {
                  write: _context3.t1
                };
                _context3.t3 = action;
                _context3.t4 = [start, target, graphName, options];
                _context3.next = 10;
                return _context3.t0.transaction.call(_context3.t0, _context3.t2, _context3.t3, _context3.t4);

              case 10:
                return _context3.abrupt('return', _context3.sent);

              case 11:
              case 'end':
                return _context3.stop();
            }
          }
        }, _callee3, this);
      }));

      return function redirectEdges(_x4, _x5, _x6, _x7) {
        return ref.apply(this, arguments);
      };
    }()
  }, {
    key: 'vertexToAttribute',
    value: function () {
      var ref = _asyncToGenerator(regeneratorRuntime.mark(function _callee4(example, graphName, options) {
        var action;
        return regeneratorRuntime.wrap(function _callee4$(_context4) {
          while (1) {
            switch (_context4.prev = _context4.next) {
              case 0:
                action = String(function (args) {

                  var db = require("internal").db;
                  var graph_module = require("@arangodb/general-graph");

                  var example = args[0];
                  var graphName = args[1];
                  var options = args[2];
                  var aql = 'RETURN GRAPH_VERTICES(@graph, @example)';
                  var matches = db._query(aql, { graph: graphName, example: example }).toArray()[0];

                  if (matches.length > 1) {
                    throw new Error('Example matched more than a single vertex.');
                  }

                  var startingVertex = matches[0];
                  var neighborsQuery = 'RETURN GRAPH_NEIGHBORS(@graph, @startingVertex, {includeData: true, direction: @direction})';
                  var neighbors = db._query(neighborsQuery, { graph: graphName, startingVertex: startingVertex, direction: options.direction }).toArray()[0];

                  var edgesQuery = 'RETURN GRAPH_EDGES(@graph, @startingVertex, {includeData: true, direction: @direction})';
                  var edges = db._query(edgesQuery, { graph: graphName, startingVertex: startingVertex, direction: options.direction }).toArray()[0];
                  //delete each of the edges
                  //XXX: Will need to consider a way to rescue data from these edges
                  edges.forEach(function (edge) {
                    var collection = edge._id.split('/')[0];
                    db._query('REMOVE @key IN @@collection', { key: edge._key, "@collection": collection }).toArray();
                  });

                  //attach startingVertex attrs to each of the neighboring vertices
                  var newNeighbors = [];
                  neighbors.forEach(function (vertex) {
                    var collection = vertex._id.split('/')[0];
                    //XXX: Here we are using the order of the arguments to MERGE to
                    //handle duplicate attributes by strategically clobbering them
                    //with the existing attributes. Revisit this.
                    var mergeQuery = '\n        UPDATE @example WITH MERGE(@vertexAttrs, @example) IN @@collection RETURN NEW\n      ';
                    var newNeighbor = db._query(mergeQuery, { example: vertex, vertexAttrs: startingVertex, "@collection": collection }).toArray()[0];
                    newNeighbors.push(newNeighbor);
                  });

                  //delete the startingVertex
                  db._query('REMOVE @key IN @@collection', { key: startingVertex._key, "@collection": startingVertex._id.split("/")[0] }).toArray();

                  return newNeighbors;
                });
                _context4.t0 = this.db;
                _context4.next = 4;
                return this.allCollections(graphName);

              case 4:
                _context4.t1 = _context4.sent;
                _context4.t2 = {
                  write: _context4.t1
                };
                _context4.t3 = action;
                _context4.t4 = [example, graphName, options];
                _context4.next = 10;
                return _context4.t0.transaction.call(_context4.t0, _context4.t2, _context4.t3, _context4.t4);

              case 10:
                return _context4.abrupt('return', _context4.sent);

              case 11:
              case 'end':
                return _context4.stop();
            }
          }
        }, _callee4, this);
      }));

      return function vertexToAttribute(_x8, _x9, _x10) {
        return ref.apply(this, arguments);
      };
    }()
  }, {
    key: 'attributeToVertex',
    value: function () {
      var ref = _asyncToGenerator(regeneratorRuntime.mark(function _callee5(example, graphName, edgeCollectionName, options) {
        var action;
        return regeneratorRuntime.wrap(function _callee5$(_context5) {
          while (1) {
            switch (_context5.prev = _context5.next) {
              case 0:
                action = String(function (args) {

                  var db = require("internal").db;

                  var example = args[0];
                  var graphName = args[1];
                  var edgeCollectionName = args[2];
                  var options = args[3];

                  if (options.additional_attrs) {
                    var additional_vertex_attributes = typeof options.additional_attrs.vertex === "undefined" ? {} : options.additional_attrs.vertex;
                    var additional_edge_attributes = typeof options.additional_attrs.edge === "undefined" ? {} : options.additional_attrs.edge;
                  } else {
                    var additional_vertex_attributes = {};
                    var additional_edge_attributes = {};
                  }

                  //Because we don't know which collection this vertex is in
                  //we pull it using GRAPH_VERTICES
                  var matchingVerticesAQL = '\n      FOR vertex IN GRAPH_VERTICES(@graph, @example)\n        RETURN vertex\n    ';
                  var matchingVertices = db._query(matchingVerticesAQL, { example: example, graph: graphName }).toArray();

                  //Declare collection here so we can use it when we create the vertex
                  var collection = null;
                  var verticesWithAttrsRemoved = [];
                  matchingVertices.forEach(function (vertex) {
                    //split the id and keep the collection name
                    collection = vertex._id.split("/")[0];
                    var removeAttributesAQL = '\n        REPLACE @vertex WITH UNSET(@vertex, ATTRIBUTES(@example)) IN @@collection\n        RETURN NEW\n      ';
                    //All the vertices that have had an attribute removed
                    var vertexWithAttrsRemoved = db._query(removeAttributesAQL, { example: example, vertex: vertex, "@collection": collection }).next();
                    verticesWithAttrsRemoved.push(vertexWithAttrsRemoved);
                  });

                  var createVertexAQL = '\n    INSERT MERGE(@additional_attrs, @attrs)\n    IN @@collection\n      RETURN NEW\n    ';
                  var newVertex = db._query(createVertexAQL, { attrs: example, additional_attrs: additional_vertex_attributes, "@collection": collection }).toArray()[0];

                  //verticesWithAttrsRemoved is an array of all the documents we removed the
                  //attribute from.
                  //Now we create edges either to or from all the vertices we removed
                  //the attribute from to the newly created vertex
                  if (options.direction == "inbound") {
                    var createEdgesAQL = '\n      FOR vertex IN @verticesWithAttrsRemoved\n        LET merged = (MERGE({ _to: @newVertexID, _from: vertex._id }, @additional_attrs))\n        INSERT merged\n        IN @@collection\n          RETURN NEW\n      ';
                  } else {
                    var createEdgesAQL = '\n      FOR vertex IN @verticesWithAttrsRemoved\n        LET merged = (MERGE({ _from: @newVertexID, _to: vertex._id }, @additional_attrs))\n        INSERT merged\n        IN @@collection\n          RETURN NEW\n      ';
                  }
                  var edges = db._query(createEdgesAQL, { verticesWithAttrsRemoved: verticesWithAttrsRemoved, additional_attrs: additional_edge_attributes, newVertexID: newVertex._id, "@collection": edgeCollectionName }).toArray();

                  //In theory all went well.
                  return newVertex;
                });
                _context5.t0 = this.db;
                _context5.next = 4;
                return this.allCollections(graphName);

              case 4:
                _context5.t1 = _context5.sent;
                _context5.t2 = {
                  write: _context5.t1
                };
                _context5.t3 = action;
                _context5.t4 = [example, graphName, edgeCollectionName, options];
                _context5.next = 10;
                return _context5.t0.transaction.call(_context5.t0, _context5.t2, _context5.t3, _context5.t4);

              case 10:
                return _context5.abrupt('return', _context5.sent);

              case 11:
              case 'end':
                return _context5.stop();
            }
          }
        }, _callee5, this);
      }));

      return function attributeToVertex(_x11, _x12, _x13, _x14) {
        return ref.apply(this, arguments);
      };
    }()
  }, {
    key: 'mergeVertices',
    value: function () {
      var ref = _asyncToGenerator(regeneratorRuntime.mark(function _callee6(exampleA, exampleB, graphName) {
        var action;
        return regeneratorRuntime.wrap(function _callee6$(_context6) {
          while (1) {
            switch (_context6.prev = _context6.next) {
              case 0:
                action = String(function (args) {

                  var db = require("internal").db;
                  var exampleA = args[0];
                  var exampleB = args[1];
                  var graphName = args[2];
                  //Check we have examples to work from
                  if (!exampleA) throw new Error('The first argument to mergeVertices was ' + vertexA);
                  if (!exampleB) throw new Error('The second argument to mergeVertices was ' + vertexB);

                  //Use exampleA to find a vertex
                  var exampleACursor = db._query('FOR v IN GRAPH_VERTICES(@graph, @example) RETURN v', { example: exampleA, graph: graphName });
                  //If the example matches more than one vertex, that's bad
                  if (exampleACursor.count() > 1) throw new Error('The first example was not specific enough and matched more than one document.');
                  //We now have our vertex to work from
                  var vertexA = exampleACursor.toArray()[0];

                  //Use exampleA to find a vertex
                  var exampleBCursor = db._query('FOR v IN GRAPH_VERTICES(@graph, @example) RETURN v', { example: exampleB, graph: graphName });
                  //If the example matches more than one vertex, that's bad
                  if (exampleBCursor.count() > 1) throw new Error('The second example was not specific enough and matched more than one document.');
                  var vertexB = exampleBCursor.toArray()[0];

                  //We now need the edges for vertexA so we can redirect them to B
                  var getEdgesAQL = '\n          FOR edge IN GRAPH_EDGES(@graph, @vertex, {includeData: true})\n            RETURN edge\n      ';
                  var vertexAedgesCursor = db._query(getEdgesAQL, { graph: graphName, vertex: vertexA });

                  //Iterate over A's edges
                  //making a new one pointing to/from B
                  //and then deleting the current edge
                  while (vertexAedgesCursor.hasNext()) {
                    var edge = vertexAedgesCursor.next();
                    //This is gross but it's the easiest way to clone an object...
                    var edgeWithoutIDs = JSON.parse(JSON.stringify(edge));
                    var collection = edge._id.split('/')[0];
                    //pick off Arango's internal attributes
                    delete edgeWithoutIDs._id;
                    delete edgeWithoutIDs._rev;
                    delete edgeWithoutIDs._key;

                    //Change the to/from to point to B
                    if (edge._to == vertexA._id) {
                      edgeWithoutIDs._to = vertexB._id;
                    }
                    if (edge._from == vertexA._id) {
                      edgeWithoutIDs._from = vertexB._id;
                    }

                    var upsertEdgeAQL = '\n         INSERT @edge IN @@collection RETURN NEW\n        ';
                    var newEdge = db._query(upsertEdgeAQL, { edge: edgeWithoutIDs, '@collection': collection }).toArray()[0];

                    db._query('REMOVE @edge IN @@collection', { edge: edge, '@collection': collection });
                  }

                  //Merge A onto B
                  var vertexBCollection = vertexB._id.split('/')[0];
                  var mergeAQL = 'UPDATE @vertexB WITH MERGE(@vertexB, @vertexA) IN @@collection RETURN NEW';
                  var merged = db._query(mergeAQL, { vertexA: vertexA, vertexB: vertexB, '@collection': vertexBCollection }).toArray()[0];

                  //Remove vertexA
                  var vertexBCollection = vertexA._id.split('/')[0];
                  db._query('REMOVE @vertex IN @@collection', { vertex: vertexA, '@collection': vertexBCollection });
                  return merged;
                });
                _context6.t0 = this.db;
                _context6.next = 4;
                return this.allCollections(graphName);

              case 4:
                _context6.t1 = _context6.sent;
                _context6.t2 = {
                  write: _context6.t1
                };
                _context6.t3 = action;
                _context6.t4 = [exampleA, exampleB, graphName];
                _context6.next = 10;
                return _context6.t0.transaction.call(_context6.t0, _context6.t2, _context6.t3, _context6.t4);

              case 10:
                return _context6.abrupt('return', _context6.sent);

              case 11:
              case 'end':
                return _context6.stop();
            }
          }
        }, _callee6, this);
      }));

      return function mergeVertices(_x15, _x16, _x17) {
        return ref.apply(this, arguments);
      };
    }()
  }, {
    key: 'eagerDelete',
    value: function () {
      var ref = _asyncToGenerator(regeneratorRuntime.mark(function _callee7(example, graphName) {
        var action;
        return regeneratorRuntime.wrap(function _callee7$(_context7) {
          while (1) {
            switch (_context7.prev = _context7.next) {
              case 0:
                action = String(function (args) {

                  var example = args[0];
                  var graphName = args[1];

                  var db = require("internal").db;
                  var graph_module = require("@arangodb/general-graph");
                  var graph = graph_module._graph(graphName);

                  var exampleCursor = db._query('FOR v IN GRAPH_VERTICES(@graph, @example) RETURN v', { example: example, graph: graphName });
                  //If the example matches more than one vertex, that's bad
                  if (exampleCursor.count() > 1) throw new Error('The example was not specific enough and matched more than one document.');
                  var vertex = exampleCursor.toArray()[0];

                  var getNeighborsAQL = '\n          FOR vertex IN GRAPH_NEIGHBORS(@graph, @vertex, {includeData: true})\n            RETURN vertex\n      ';
                  var neighborsCursor = db._query(getNeighborsAQL, { graph: graphName, vertex: vertex });

                  //Iterate over the neighbors
                  //If the neighbor vertex only linked to the vertex we are deleting
                  //get rid of it.
                  var ids = null;
                  while (neighborsCursor.hasNext()) {
                    var neighbor = neighborsCursor.next();
                    var neighborIDsAQL = '\n            FOR vertex IN GRAPH_NEIGHBORS(@graph, @vertex, {})\n              RETURN vertex\n        ';
                    var neighborIDs = db._query(neighborIDsAQL, { graph: graphName, vertex: neighbor }).toArray();
                    if (neighborIDs.length == 1) {
                      if (neighborIDs[0] == vertex._id) {
                        //Only a single neighbor? That neighbors id is also the id
                        //of our vertex to delete?
                        //This vertex would be orphaned by our deletion.
                        var collection = neighborIDs[0].split('/')[0];
                        graph[collection].remove(neighbor._id);
                      }
                    }
                  }

                  var vertexCollection = vertex._id.split('/')[0];
                  //Use the general graph module to delete
                  //because it deletes the edges for us:
                  graph[vertexCollection].remove(vertex._id);
                  return vertex;
                });
                _context7.t0 = this.db;
                _context7.next = 4;
                return this.allCollections(graphName);

              case 4:
                _context7.t1 = _context7.sent;
                _context7.t2 = {
                  write: _context7.t1
                };
                _context7.t3 = action;
                _context7.t4 = [example, graphName];
                _context7.next = 10;
                return _context7.t0.transaction.call(_context7.t0, _context7.t2, _context7.t3, _context7.t4);

              case 10:
                return _context7.abrupt('return', _context7.sent);

              case 11:
              case 'end':
                return _context7.stop();
            }
          }
        }, _callee7, this);
      }));

      return function eagerDelete(_x18, _x19) {
        return ref.apply(this, arguments);
      };
    }()
  }, {
    key: 'splitEdgeCollection',
    value: function () {
      var ref = _asyncToGenerator(regeneratorRuntime.mark(function _callee8(attribute, collectionName) {
        var sourceCollection, destinationCollection, aql, cursor, attributeValues, i, attributeValue, copyAQL, copyCursor, collections;
        return regeneratorRuntime.wrap(function _callee8$(_context8) {
          while (1) {
            switch (_context8.prev = _context8.next) {
              case 0:
                _context8.next = 2;
                return this.db.collection(collectionName).get();

              case 2:
                sourceCollection = _context8.sent;
                destinationCollection = {};
                aql = '\n    FOR document in @@collection FILTER HAS(document, @attr) RETURN DISTINCT document[@attr]\n    ';
                _context8.next = 7;
                return this.db.query(aql, { '@collection': collectionName, attr: attribute });

              case 7:
                cursor = _context8.sent;
                _context8.next = 10;
                return cursor.all();

              case 10:
                attributeValues = _context8.sent;
                i = 0;

              case 12:
                if (!(i < attributeValues.length)) {
                  _context8.next = 36;
                  break;
                }

                attributeValue = attributeValues[i];
                // Create a new edge collection named after the attribute value

                _context8.prev = 14;
                _context8.next = 17;
                return this.db.edgeCollection(attributeValue);

              case 17:
                destinationCollection = _context8.sent;
                _context8.next = 22;
                break;

              case 20:
                _context8.prev = 20;
                _context8.t0 = _context8['catch'](14);

              case 22:
                _context8.prev = 22;
                _context8.next = 25;
                return destinationCollection.create();

              case 25:
                _context8.next = 29;
                break;

              case 27:
                _context8.prev = 27;
                _context8.t1 = _context8['catch'](22);

              case 29:
                // it exists already.


                //copy each doc to new collection
                copyAQL = '\n      FOR document IN @@sourceCollection\n      FILTER document[@attr] == @attrVal\n      INSERT UNSET(document, \'_id\', \'_key\', \'_rev\') IN @@destinationCollection\n      REMOVE document IN @@sourceCollection\n      ';
                _context8.next = 32;
                return this.db.query(copyAQL, { '@destinationCollection': attributeValue, '@sourceCollection': sourceCollection.name, attr: attribute, attrVal: attributeValue });

              case 32:
                copyCursor = _context8.sent;

              case 33:
                i++;
                _context8.next = 12;
                break;

              case 36:
                _context8.next = 38;
                return this.db.listCollections();

              case 38:
                collections = _context8.sent;
                return _context8.abrupt('return', collections.map(function (collection) {
                  return collection.name;
                }));

              case 40:
              case 'end':
                return _context8.stop();
            }
          }
        }, _callee8, this, [[14, 20], [22, 27]]);
      }));

      return function splitEdgeCollection(_x20, _x21) {
        return ref.apply(this, arguments);
      };
    }()
  }, {
    key: 'splitDocumentCollection',
    value: function () {
      var ref = _asyncToGenerator(regeneratorRuntime.mark(function _callee9(attribute, collectionName, graphName) {
        var sourceCollection, destinationCollection, aql, cursor, attributeValues, i, attributeValue, action, collections, _i;

        return regeneratorRuntime.wrap(function _callee9$(_context9) {
          while (1) {
            switch (_context9.prev = _context9.next) {
              case 0:
                _context9.next = 2;
                return this.db.collection(collectionName).get();

              case 2:
                sourceCollection = _context9.sent;
                destinationCollection = {};
                aql = '\n    FOR document in @@collection FILTER HAS(document, @attr) RETURN DISTINCT document[@attr]\n    ';
                _context9.next = 7;
                return this.db.query(aql, { '@collection': collectionName, attr: attribute });

              case 7:
                cursor = _context9.sent;
                _context9.next = 10;
                return cursor.all();

              case 10:
                attributeValues = _context9.sent;
                i = 0;

              case 12:
                if (!(i < attributeValues.length)) {
                  _context9.next = 27;
                  break;
                }

                attributeValue = attributeValues[i];
                _context9.next = 16;
                return this.db.collection(attributeValue);

              case 16:
                destinationCollection = _context9.sent;
                _context9.prev = 17;
                _context9.next = 20;
                return destinationCollection.create();

              case 20:
                _context9.next = 24;
                break;

              case 22:
                _context9.prev = 22;
                _context9.t0 = _context9['catch'](17);

              case 24:
                i++;
                _context9.next = 12;
                break;

              case 27:

                //Now that we know the collections we will interact with
                //we can use a transaction
                action = String(function (args) {

                  var attribute = args[0];
                  var collectionName = args[1];
                  var attributeValues = args[2];
                  var graphName = args[3];

                  var db = require("internal").db;
                  var graph_module = require("@arangodb/general-graph");
                  var graph = graph_module._graph(graphName);

                  //TODO: we are going outside the collection here...
                  //probably just pass the collection name
                  var getDocsWithAttributeAQL = '\n        FOR document in @@collection FILTER HAS(document, @attr) RETURN document\n      ';
                  var docsCursor = db._query(getDocsWithAttributeAQL, { '@collection': collectionName, attr: attribute });
                  while (docsCursor.hasNext()) {
                    var vertex = docsCursor.next();
                    //get edges
                    var getEdgesAQL = '\n          FOR edge in GRAPH_EDGES(@graph, @vertex, {includeData: true})\n            RETURN edge\n          ';
                    var edgesCursor = db._query(getEdgesAQL, { graph: graphName, vertex: vertex });

                    //copy doc to new collection return NEW
                    var newDoc = db._query('INSERT UNSET(@doc, \'_id\', \'_key\', \'_rev\') IN @@collection RETURN NEW', { '@collection': vertex[attribute], doc: vertex }).toArray()[0];
                    //recreate edges to point to new doc
                    while (edgesCursor.hasNext()) {
                      var edge = edgesCursor.next();
                      //get the collection the edge lives in
                      var edgeCollection = edge._id.split('/')[0];
                      if (edge._to == vertex._id) {
                        //point the edge at the new document we created
                        edge._to == newDoc._id;
                        //insert the new edge and delete the old one.
                        var replaceEdgeAQL = '\n                INSERT UNSET(@edge, \'_id\', \'_key\', \'_rev\') IN @@edgeCollection\n              ';
                        db._query(replaceEdgeAQL, { '@edgeCollection': edgeCollection, edge: edge });
                        var replaceEdgeAQL = '\n                REMOVE @edge IN @@edgeCollection\n              ';
                        db._query(replaceEdgeAQL, { '@edgeCollection': edgeCollection, edge: edge });
                      }
                      if (edge._from == vertex._id) {
                        //point the edge at the new document we created
                        edge._from == newDoc._id;
                        //insert the new edge and delete the old one.
                        var replaceEdgeAQL = '\n                INSERT UNSET(@edge, \'_id\', \'_key\', \'_rev\') IN @@edgeCollection\n              ';
                        db._query(replaceEdgeAQL, { '@edgeCollection': edgeCollection, edge: edge });
                        var replaceEdgeAQL = '\n                REMOVE @edge IN @@edgeCollection\n              ';
                        db._query(replaceEdgeAQL, { '@edgeCollection': edgeCollection, edge: edge });
                      }
                    }
                    db._query('REMOVE @vertex IN @@collection', { '@collection': collectionName, vertex: vertex });
                  }
                  //Not even sure what to return here.
                  return true;
                });

                //combine the collections involved in the graph
                //with the collections we just created
                //so we can lock them all

                _context9.next = 30;
                return this.allCollections(graphName);

              case 30:
                collections = _context9.sent;

                for (_i = 0; _i < attributeValues.length; _i++) {
                  collections.push(attributeValues[_i]);
                }
                _context9.next = 34;
                return this.db.transaction({ write: collections }, action, [attribute, collectionName, attributeValues, graphName]);

              case 34:
                return _context9.abrupt('return', _context9.sent);

              case 35:
              case 'end':
                return _context9.stop();
            }
          }
        }, _callee9, this, [[17, 22]]);
      }));

      return function splitDocumentCollection(_x22, _x23, _x24) {
        return ref.apply(this, arguments);
      };
    }()
  }]);

  return GraphMigration;
}();
// TODO: Revisit this but use graphs instead of collections.
// let removeAttribute = async (example, collection) => {
//   //Then remove the attribute from existing vertices
//   //FIXME: use the collection variable
//   let aql = aqlQuery`
//     FOR vertex IN vertices
//       FILTER MATCHES(vertex, ${example})
//         REPLACE vertex WITH UNSET(vertex, ATTRIBUTES(${example})) IN vertices
//           RETURN NEW
//   `
//   let cursor = await db.query(aql)
//   return cursor.all()
// }


exports.default = GraphMigration;