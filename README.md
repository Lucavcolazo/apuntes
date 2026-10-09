# Tomapuntes

Lector de PDFs de clase con subrayado, notas, pomodoro, estadísticas y exportación.

```bash
npm install
npm run dev
```

Abrí http://localhost:5173.

## Cómo funciona

- **Inicio (`/`)**: un tomate vuela y se estrella contra el título; después baja solo a **Tu lectura**: tiempo leído esta semana (y contra la anterior), minutos por día, racha, pomodoros, subrayados, el % de cada libro que estás leyendo y el tiempo por carpeta.
- **Apuntes (`/apuntes`)** y **lector (`/apuntes/:id`)**: la biblioteca y la lectura de cada libro tienen su propia URL.
- **Tiempo de lectura**: se cuenta solo mientras el libro está abierto, la pestaña visible y hubo actividad en los últimos 3 minutos. No cuenta durante las pausas del pomodoro.

- **Biblioteca y carpetas**: subí PDFs (botón o arrastrando). Cada uno se muestra con su primera página como tapa. Creá carpetas con "Nueva carpeta" y mové los apuntes arrastrándolos a una carpeta o desde su menú. Si subís con una carpeta abierta, van ahí.
- **Tomate**: girá el dial para elegir los minutos y tocá el tomate para empezar. En las pausas se pone verde y tapa los apuntes (se puede desactivar en ajustes).
- **Lectura inmersiva**: al abrir un libro todo alrededor queda oscuro y la barra se esconde si no movés el mouse. Tonos de página: papel, crema y noche.
- **Subrayar**: seleccioná texto y elegí un color. Ese color queda como **marcador**: lo que selecciones después se subraya solo con esa categoría. Cambialo desde la barra o con las teclas `1`–`4`; apagalo tocando el mismo color, con `0` o `Esc`. Mantené `⌥ Option` al seleccionar para no subrayar.
- **Deshacer**: `⌘Z` / `⌘⇧Z` (o los botones de la barra) para subrayados, colores, notas y borrados.
- Clic sobre un subrayado para cambiarle el color, agregar una nota o borrarlo.
- **Exportar**: desde el panel de subrayados, a Markdown, al portapapeles o a un resumen para imprimir o guardar como PDF.

## Subrayados dentro del PDF

"Guardar en PDF" escribe los subrayados como anotaciones de resaltado estándar, así se ven en Libros, Vista Previa, Archivos del iPhone, Acrobat, etc.

- **Chrome / Edge**: guarda sobre el archivo original. Si el PDF está en iCloud Drive, lo ves subrayado en el celu. Después del primer permiso, se guarda solo.
- **Safari / Firefox**: descarga una copia con los subrayados.

Si subís un PDF que ya tiene resaltados (por ejemplo, hechos en el celu), la app los importa.

## Datos

Todo queda en el navegador (IndexedDB). No hay servidor. Si borrás los datos del sitio, se pierden los subrayados que no hayas guardado en el PDF.

## Publicarla

Es una app de una sola página: el hosting tiene que devolver `index.html` para cualquier ruta (en Netlify/Vercel/Cloudflare Pages es una regla de "rewrite" a `/index.html`).

## Stack

Vite · React · TypeScript · pdf.js (lectura) · pdf-lib (escritura de anotaciones) · Dexie (IndexedDB)
