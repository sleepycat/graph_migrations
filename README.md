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

There is just one useful function working at the moment. It runs in a
transaction and while there is plenty of room for improvement it does do
useful work.


```javascript
attributeToVertex({year: 2004}, {direction: "inbound"})
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
attributeToVertex({founding_year: 2004}, {direction: "inbound",
additional_attrs: {vertex: {foo: "bar"}, edge: {}}})
```

## TODO

* Do some thinking about working without requiring specific collection
  names.
* Make a vertexToAttribute function.
* Keep going!

This is all highly experimental.
Ideas and pull requests welcome.
