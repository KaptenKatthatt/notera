# Field – fältklocka för Garmin Instinct 2S

En analog urtavla i klassisk militär fältklocke-stil för Connect IQ.

![Förhandsvisning](preview.png)

*Förhandsbilden är ritad med samma geometri som koden men med ungefärliga typsnitt.*

- Siffrorna 1–12 och en inre 24-timmarsring (13–24)
- Hålade timmarkeringar och minutstreck
- Ihåliga visare och en tunn sekundvisare med pilspets, som syns när du tittar på klockan
- Veckodag och datumfönster i det runda fönstret uppe till höger

## Ljus version

Det finns också en inverterad version, **Field Ljus**, med mörka visare och siffror på ljus urtavla.
Den har ett eget app-id, så du kan ha båda installerade och växla mellan dem på klockan.

![Förhandsvisning ljus](preview-light.png)

## Inställningar

- **Ljus urtavla**: mörkt på ljust i stället för ljust på mörkt (av som standard).
- **Visa 24-timmarsring** (på som standard). Ringen döljs också automatiskt om typsnittet är för stort för skärmen.

## Bygga och installera

Samma steg som för `garmin-marathon-watchface`, se dess README. Kort version:

```sh
# Mörk version
monkeyc -f monkey.jungle -d instinct2s -y /sökväg/till/developer_key.der -o bin/Field.prg
# Ljus version
monkeyc -f monkey-light.jungle -d instinct2s -y /sökväg/till/developer_key.der -o bin/FieldLjus.prg
```

I VS Code väljer du vilken jungle-fil som gäller under inställningen **Monkey C: Jungle Files**
(`monkey.jungle` eller `monkey-light.jungle`).

Kopiera sedan `.prg`-filen eller filerna till `GARMIN/APPS` på klockan.
