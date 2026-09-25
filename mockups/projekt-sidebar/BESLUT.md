# Projekt i sidopanelen: beslut

Klickbar mockup: `index.html` i den här mappen. Den har ingen riktig disk, all data ligger i `localStorage`, och panelen "Disk" visar vad som skulle hända med filerna. Den gula raden överst hör till mockupen, inte till appen.

1. Du väljer en anteckningsmapp i Inställningar, till exempel `OneDrive\Dokument\Notera`. Varje projekt är en undermapp med projektets namn, och det är Notera som hanterar strukturen. Om du byter namn på ett projekt byts mappens namn också. En befintlig fil som du tilldelar ett projekt flyttas in, den kopieras aldrig.
2. Projekten ligger i en enda nivå. Både projekten och anteckningarna har en manuell ordning som du ändrar genom att dra och släppa, och den sparas i `.notera.json` i anteckningsmappen.
3. Osorterat fungerar som inkorg. Snabbsök (Ctrl+Shift+F) går igenom titel och innehåll, även i arkivet. Anteckningar går att fästa överst i sitt projekt.
4. Plus på ett projekt skapar en anteckning direkt, utan dialog. Filen döps till `ÅÅÅÅ-MM-DD Titel.md` efter `# `-rubriken när du lämnar rubrikraden. Heter två filer likadant får den ena " (2)" i slutet.
5. Sidhuvud: `# Titel` följt av `Projekt: X · Skapad: ÅÅÅÅ-MM-DD HH:MM`. Projektraden skrivs om när anteckningen flyttas eller projektet byter namn. Skapad ändras aldrig.
6. Arkivet är gemensamt och ligger i `Arkiv\Projekt\`. Hela projekt kan också arkiveras. Återställer du en anteckning vars projekt inte längre finns återskapas projektet.
7. Klickar du på en anteckning öppnas den i en flik, eller så växlar Notera till fliken om den redan är öppen. Filer utanför anteckningsmappen får "Flytta till projekt…" i flikmenyn.
8. Sidopanelen ligger till vänster. Du kan ändra bredden, och Ctrl+Shift+B fäller in och ut den. Den döljs i skrivläget. Första gången är den stängd tills du har valt en anteckningsmapp.
9. Ctrl+T skapar en anteckning i Osorterat när en anteckningsmapp är vald, annars ett utkast som idag. Ctrl+Alt+N skapar en anteckning i det projekt du står i.
10. Borttagna filer hamnar i Windows papperskorg. Ett projekt med innehåll går att ta bort. Dialogen varnar och erbjuder "Arkivera i stället". Efter arkivering, flytt och borttagning visas en ångra-rad.
