# Graph Migrations

I've been using [ArangoDB](https://www.arangodb.com) for a couple of
years now. So far the only thing I miss after moving away from a
relational database is the migrations that Rails provides.

The code here is just thinking out loud, its not intended for use.
What's being explored here are common modifications to existing graphs.

Examples:
* Moving the attributes on a hub vertex onto all the vertices its connected to.
* Taking an attribute from multiple vertices and making a hub out of it.
* Reversing the direction of relationships
* Adding intermediary vertices based on edge attributes
* Adding/removing indexes
* Automatically dividing edges among edge collections
* Executing these things in order and tracking which ones have run

There are definitely others.

Probably most of these make sense as one or more Foxx applications, or
maybe some custom AQL functions. It's not clear yet, but for ease of
exploration its currently an node module.

## What works

The code at the moment assumes you have two collections: vertices &
edges.

### attributeToVertex

```javascript
attributeToVertex({year: 2004}, "mygraph", {direction: "inbound"})
```
The code above will create a new vertex with {year: 2004} and remove the
attribute "year": 2004 from all the documents in the vertices
collection, creating edges pointing to the new {year: 2004} vertex.

The option direction: "inbound" could also obviously be "outbound" and
the direction of the edges created would be reversed.

Since we are creating vertices and edges, it would also be nice to
be able to add extra attributes to be added. You can do that with the
additional_attrs option:

```javascript
attributeToVertex({founding_year: 2004}, "mygraph", {direction: "inbound",
additional_attrs: {vertex: {foo: "bar"}, edge: {}}})
```
### vertexToAttribute

```javascript
vertexToAttribute({name: "mysql"}, "mygraph", {direction: "inbound"})
```

This is aimed at getting rid of hubs (high degree vertices) in your data set.

The first argument is an example that is assumed to uniquely identify
the hub.

Attributes from the hub will be copied to all neighbors with inbound
edges (obviously {direction: "outbound"} is an option as well), with the
neighbors attributes being retained in the case of duplication.

The hub and any edges are then deleted.

### redirectEdges

```javascript
redirectEdges({_id: "vertices/1234"}, {_id: "vertices/5678"}, "mygraph", {direction: "inbound"})
```
If you have edges pointing somewhere and want them pointing somewhere
else, this is the function that does it. It expects to work with
something with an `_id` attribute.

## TODO

* Remove collection names from attributeToVertex

This is all highly experimental.
Ideas and pull requests welcome.
