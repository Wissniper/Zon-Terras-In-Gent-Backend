# Semantic SPARQL Queries

This document provides example SPARQL queries that leverage the semantic links between Terraces, Restaurants, and Events in the Sun-Seeker dataset.

## 1. Events at a sunny Italian Restaurant
Since Restaurants in our database have their own sun-intensity data, we can find events directly at zonnige Italianen.

```sparql
PREFIX schema: <https://schema.org/>
PREFIX zt: <http://api.sun-seeker.be/vocab#>

SELECT ?eventTitle ?restaurantName ?intensity WHERE {
  # 1. Start from the event
  ?event a schema:Event ;
         schema:name ?eventTitle ;
         schema:location ?restaurant .
  
  # 2. Link to the restaurant
  ?restaurant a schema:Restaurant ;
              schema:name ?restaurantName ;
              schema:servesCuisine "Italian" ;
              zt:sunIntensity ?intensity .
  
  FILTER(?intensity > 80)
}
```

## 2. Events at a sunny Café (Terras)
This query finds events at independent cafés/bars that are currently very sunny.

```sparql
PREFIX schema: <https://schema.org/>
PREFIX zt: <http://api.sun-seeker.be/vocab#>

SELECT ?eventTitle ?cafeName ?intensity WHERE {
  ?event a schema:Event ;
         schema:name ?eventTitle ;
         schema:location ?terras .
  
  ?terras a zt:Terras ;
          schema:name ?cafeName ;
          zt:sunIntensity ?intensity .
  
  FILTER(?intensity > 90)
}
```

## 2. Find all events happening today at a specific location
```sparql
PREFIX schema: <https://schema.org/>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>

SELECT ?title ?startDate WHERE {
  ?event a schema:Event ;
         schema:name ?title ;
         schema:startDate ?startDate .
  
  # Filter for a specific day (e.g., 2024-05-20)
  FILTER(CONTAINS(STR(?startDate), "2024-05-20"))
}
ORDER BY ?startDate
```

## 3. High-rated Restaurants with their Terrace sun intensity
```sparql
PREFIX schema: <https://schema.org/>
PREFIX zt: <http://api.sun-seeker.be/vocab#>

SELECT ?restaurantName ?intensity WHERE {
  ?restaurant a schema:Restaurant ;
              schema:name ?restaurantName .
  
  # If we have the zt:hasTerras link implemented
  ?restaurant zt:hasTerras ?terras .
  ?terras zt:sunIntensity ?intensity .

  FILTER(?intensity > 50)
}
ORDER BY DESC(?intensity)
```

## 4. Federated Query: Internal Events + OSM Wheelchair Access
This query combines our internal event data with OSM's accessibility tags.

```sparql
PREFIX schema: <https://schema.org/>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX osmkey: <https://www.openstreetmap.org/wiki/Key:>

SELECT ?eventTitle ?address ?wheelchair WHERE {
  ?event a schema:Event ;
         schema:name ?eventTitle ;
         schema:location ?terras .
  
  ?terras owl:sameAs ?osmUri ;
          schema:address ?address .

  # Fetch additional tags from the OSM graph
  ?osmUri osmkey:wheelchair ?wheelchair .
  
  FILTER(?wheelchair = "yes")
}
```
