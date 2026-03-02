# Probleemstelling

In Gent is een zonnig terras vinden lastig. Een kleine verschuiving in
zonpositie maakt het verschil tussen zon of schaduw door kerktorens en
gebouwen. Studenten en terrasgangers lopen vaak vergeefs.

# Doelstelling

Terras Sun-Seeker toont real-time welke Gentse caféterrassen zonnig
zijn. Helpt studenten, remote workers en fotografen de juiste plek te
vinden.

Kaart met lichtintensiteit of kleurcodes: geel voor zon, blauw voor
schaduw. Sun-Dial toont zonvoorspelling vooruit in de tijd.

# Doelgroep

-   Student bij Korenmarkt: zonnig café tijdens pauze.

-   Remote worker hittegolf: schaduwrijke terrassen.

-   Fotograaf: golden hour notificaties.

# Voordelen
-   Geen tijdverspilling met lopen.

-   Comfortabele plek voor elk weertype.

-   Planning voor groepspauzes.

-   Afgestemd op Gentse situatie.

# Ontwerp en architectuur

## Eigen API

De API maakt het mogelijk om data-updates dynamisch en schaalbaar te
beheren.

-   **Endpoints** voor real-time zondata per terras, met parameters
    zoals locatie, tijdstip en lichtintensiteit.

-   **Weerdata-integratie** via een externe meteorologische bron (bv.
    OpenWeather).

-   **Event listeners** die automatisch updates pushen bij veranderingen
    in zonpositie of bewolking.

## Client-side app die communiceert met de API

De React-frontend wordt gebruikt om continu data op te vragen en te
visualiseren.

-   Interactieve kaart met dynamische kleurupdates & lichtintensiteit op
    basis van API-data.

-   **Sun-Dial** component dat voorspellingen vanuit de API
    visualiseert.

-   **Zoek- en filterfunctie** (bijvoorbeeld \"toon alleen zonnige
    terrassen\").

-   Gebruik van asynchrone communicatie voor real-time dataflow.

## Client-side optimalisaties

Om de performantie en gebruikerservaring te garanderen worden de
volgende optimalisaties toegepast:

-   **Caching** van API-resultaten.

-   **Periodieke data-refresh**.

-   **Lazy loading** van kaartcomponenten en progressieve rendering.

# Implementatie

-   **API**: Node.js + TypeScript + Express.

-   **Client**: React + TypeScript.

-   **Database**: MongoDB voor opslag van weersvoorspellingen.

-   **Versiebeheer**: GitHub repository met CI/CD pipeline.

# Toekomst

Uitbreiding naar andere steden. Community functies met beloningen.
