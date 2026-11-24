# Kapten Katt – figurklocka för Garmin Instinct 2S

En klassisk visartavla där en tecknad katt med kaptensmössa står mitt på
urtavlan och pekar ut tiden med armarna: den korta armen visar timmar och den
långa armen minuter.

![Förhandsvisning](preview.png)

*Förhandsbilden är ritad med samma geometri som koden men med ungefärliga typsnitt.*

- Siffrorna 1–12 med minutstreck
- Armar med pekande handskar som visare och en tunn sekundvisare som syns när du tittar på klockan
- Veckodag och datum i det runda fönstret uppe till höger

## Inställningar

- **Mörk urtavla**: ljust på mörkt i stället för mörkt på ljust (av som standard).

## Bygga och installera

1. Installera [Connect IQ SDK Manager](https://developer.garmin.com/connect-iq/sdk/), logga in
   med ditt Garmin-konto och ladda ner senaste SDK:n plus enheten **Instinct 2S**.
2. Installera tillägget **Monkey C** i VS Code.
3. Kör `Monkey C: Generate a Developer Key` (görs en gång).
4. Öppna den här mappen och kör `Monkey C: Run`, välj `instinct2s`. Simulatorn startar.
5. För att installera på klockan: kör `Monkey C: Build for Device`, koppla klockan med USB
   och kopiera `.prg`-filen till mappen `GARMIN/APPS` på klockan.
6. På klockan: håll inne **MENU**, välj **Watch Face**, sedan urtavlan och **Apply**.

Från kommandoraden:

```sh
monkeyc -f monkey.jungle -d instinct2s -y /sökväg/till/developer_key.der -o bin/KaptenKatt.prg
```
