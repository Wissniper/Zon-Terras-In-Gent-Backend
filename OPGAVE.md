# opgave.md: REST Web-API voor Audioboeken Bibliotheek

## Inleiding
Deze opgave richt zich op het ontwerpen en implementeren van een web-API volgens de REST architecturale stijl voor een audioboeken bibliotheek. De API moet werken als webtoepassing in browsers (HTML) en als interface voor andere toepassingen (JSON), met resources als kernconcept. [astera](https://www.astera.com/nl/type/blog/rest-api-definition/)

Resources worden uniek geïdentificeerd via HTTP-URL's, voorgesteld als representaties (HTML/JSON) via content negotiation, bewerkt met HTTP-methodes (GET, POST, PUT, DELETE, PATCH) en bestuurd via hypermedia controls. [libstore.ugent](https://libstore.ugent.be/fulltxt/RUG01/002/946/106/RUG01-002946106_2021_0001_AC.pdf)

## Kernconcepten REST
### Resources
Resources zijn conceptuele entiteiten zoals "audioboek met naam X" of "beoordeling door gebruiker Y", geïdentificeerd door URL's (bijv. `/audiobooks/123`). Elke resource heeft een unieke identiteit, onafhankelijk van haar waarde. [astera](https://www.astera.com/nl/type/blog/rest-api-definition/)

### Representaties
Eén resource heeft meerdere representaties: HTML voor browsers, JSON voor machines. Gebruik `Accept: application/json` voor JSON via curl. [de.linkedin](https://de.linkedin.com/learning/rest-apis-lernen/die-restful-bibliothek-kennenlernen)

### HTTP-Methodes
- GET `/audiobooks/123`: Haal representatie op.
- POST `/audiobooks`: Voeg nieuw audioboek toe.
- PUT `/audiobooks/123`: Overschrijf volledig.
- PATCH `/audiobooks/123`: Wijzig gedeeltelijk.
- DELETE `/audiobooks/123`: Verwijder (zacht voor audioboeken). [learn.microsoft](https://learn.microsoft.com/nl-nl/azure/architecture/best-practices/api-design)

### Hypermedia
Voeg links toe in representaties (HTML: `<a>`, JSON: `{"related": [{"href": "/audiobooks/124"}]}`). Clients navigeren stateless via deze links. [studie.wina-gent](https://studie.wina-gent.be/media/studiehulp/Webdevelopment_-_Samenvatting__met_dank_aan_DERP_.pdf)

## Vereiste Entiteiten
| Entiteit | Velden |
|----------|--------|
| Gebruiker | naam (string, niet leeg), e-mail (geldig formaat)  |
| Genre | naam, beschrijving |
| Audioboek | naam, auteurs (array), genres (array), beschrijving, publicatiedatum, aankooplink, duur (ms) |
| Beoordeling | gebruiker, audioboek, beschrijving, score |
| Afspeelpositie | gebruiker, audioboek, positie (ms) |

Validatie: namen niet leeg, e-mail geldig, beoordelingen alleen voor afgespeelde audioboeken. [de.linkedin](https://de.linkedin.com/learning/rest-apis-lernen/die-restful-bibliothek-kennenlernen)

## Functionaliteit
- **Lijsten en details**: GET voor overzichten (bijv. `/users/1/audiobooks` voor profiel met beluisterde boeken).
- **CRUD**: Volledige bewerkingen op gebruikers, genres, beoordelingen, posities (hard delete).
- **Audioboeken verwijderen**: Zacht (niet publiek zichtbaar, data behouden).
- **Gelinkte data**: Bij genre-delete, update audioboek-referenties; cascade delete waar nodig.
- **Geen auth**: Voeg gebruiker toe via formulieren voor simulatie. [learn.microsoft](https://learn.microsoft.com/nl-nl/azure/architecture/best-practices/api-design)

Profiel toont lijsten van beluisterde en lopende audioboeken via posities/beoordelingen.

## Technische Eisen
### MVC Raamwerk
Gebruik Node.js met MVC-raamwerk: Express, Fastify, NestJS, etc. (Fastify aanbevolen voor performance). [github](https://github.com/fastify/fastify-express)

- **Model**: Definieer datatypes (Mongoose voor MongoDB), validatie (bijv. body >300 woorden).
- **View**: Sjablonen voor HTML/JSON (groepeer in subfolders).
- **Controller**: Handelt HTTP-methodes, genereert representaties.

Gebruik eigen MongoDB, Promises/async-await, geen code duplicatie. [telerik](https://www.telerik.com/blogs/modern-apis-fastify-node)

### Setup Stappen
1. Init project: `npm init`, installeer raamwerk (bijv. `npm i fastify`).
2. Routes opsplitsen: `/routes/audiobooks.js`, etc.
3. Views: Subfolders zoals `/views/audiobooks/`.
4. Test JSON: `curl -H "Accept: application/json" http://localhost:3000/audiobooks`.
5. Debug: VS Code/WebStorm (je voorkeur).

Volg MDN Express of Fastify Getting Started, maar pas aan (geen async lib, native HTTP DELETE/PUT/PATCH). [github](https://github.com/fastify/fastify)

## Taken
### Taak 1: Raamwerk Kennismaking
Bouw basis app per handleiding (niet indienen). Begrijp MVC-structuur. [telerik](https://www.telerik.com/blogs/modern-apis-fastify-node)

### Taak 2: HTML Webtoepassing
Implementeer volledige CRUD voor audioboeken bibliotheek met validatie en hypermedia. [de.linkedin](https://de.linkedin.com/learning/rest-apis-lernen/die-restful-bibliothek-kennenlernen)

### Taak 3: JSON Uitbreiding
Voeg JSON-representaties toe met links. Test met curl. Maak optioneel custom hypermedia-type. [astera](https://www.astera.com/nl/type/blog/rest-api-definition/)

## Resource Voorbeeld
**HTML (/audiobooks/123)**:
```
<h1>Audioboek Naam</h1>
<p>Beschrijving...</p>
<a href="/audiobooks/123/reviews">Beoordelingen</a>
<form method="POST" action="/audiobooks/123/positions">
  Positie: <input name="positie">
</form>
```

**JSON**:
```json
{
  "audioboek": {"naam": "Boek", "duur": 3600000},
  "links": [{"rel": "reviews", "href": "/audiobooks/123/reviews"}]
}
```

Zorg voor stateless, zelf-beschrijvende berichten en correct resource-ontwerp (geen `/addReview`, maar `/audiobooks/123/reviews`). [appmaster](https://appmaster.io/nl/blog/de-zes-rustregels)