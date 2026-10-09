# Apuntes

Lector de PDFs de clase con subrayado, notas, pomodoro y exportación.

```bash
npm install
npm run dev
```

Abrí http://localhost:5173.

## Cómo funciona

- **Biblioteca**: subí PDFs (botón o arrastrando). Cada uno se muestra con su primera página como tapa y se puede agrupar por materia.
- **Tomate**: girá el dial para elegir los minutos y tocá el tomate para empezar. En las pausas se pone verde y tapa los apuntes (se puede desactivar en ajustes).
- **Lectura inmersiva**: al abrir un libro todo alrededor queda oscuro y la barra se esconde si no movés el mouse. Tonos de página: papel, crema y noche.
- **Subrayar**: seleccioná texto y elegí un color (o teclas `1`–`4`). Clic sobre un subrayado para cambiarle el color, agregar una nota o borrarlo.
- **Exportar**: desde el panel de subrayados, a Markdown, al portapapeles o a un resumen para imprimir o guardar como PDF.

## Subrayados dentro del PDF

"Guardar en PDF" escribe los subrayados como anotaciones de resaltado estándar, así se ven en Libros, Vista Previa, Archivos del iPhone, Acrobat, etc.

- **Chrome / Edge**: guarda sobre el archivo original. Si el PDF está en iCloud Drive, lo ves subrayado en el celu. Después del primer permiso, se guarda solo.
- **Safari / Firefox**: descarga una copia con los subrayados.

Si subís un PDF que ya tiene resaltados (por ejemplo, hechos en el celu), la app los importa.

## Datos

Todo queda en el navegador (IndexedDB). No hay servidor. Si borrás los datos del sitio, se pierden los subrayados que no hayas guardado en el PDF.

## Stack

Vite · React · TypeScript · pdf.js (lectura) · pdf-lib (escritura de anotaciones) · Dexie (IndexedDB)
