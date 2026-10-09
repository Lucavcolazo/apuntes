// Genera un PDF de prueba con texto: node scripts/make-sample-pdf.mjs public/test.pdf [biologia|redes]
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync } from 'node:fs';
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.TimesRoman);
const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
const TOPICS = {
  biologia: { title: 'Biologia vegetal', paras: [
  'La fotosintesis es el proceso mediante el cual las plantas, algas y algunas bacterias transforman la energia luminosa en energia quimica.',
  'Durante la fase luminosa, la clorofila absorbe la luz y se produce ATP y NADPH, liberando oxigeno como subproducto de la ruptura del agua.',
  'En la fase oscura, tambien llamada ciclo de Calvin, el dioxido de carbono se fija y se transforma en glucosa utilizando la energia acumulada.',
  'Definicion: un autotrofo es un organismo capaz de sintetizar sus propios nutrientes a partir de sustancias inorganicas.',
  'Ejemplo: las plantas de interior realizan fotosintesis incluso con luz artificial, aunque con menor rendimiento que bajo luz solar directa.',
  ] },
  redes: { title: 'Capa de enlace', paras: [
  'La capa de enlace se encarga de transferir tramas entre nodos vecinos de una misma red, detectando y a veces corrigiendo errores.',
  'Ethernet utiliza direcciones MAC de 48 bits para identificar cada interfaz y CSMA/CD para compartir el medio en redes antiguas.',
  'Un switch aprende las direcciones MAC de cada puerto y reenvia las tramas solo hacia el destino, reduciendo las colisiones.',
  'Definicion: una VLAN es una red logica que agrupa puertos de uno o varios switches como si fueran un mismo dominio de difusion.',
  'Ejemplo: el protocolo ARP traduce una direccion IP en la direccion MAC necesaria para entregar la trama en la red local.',
  ] },
};
const topic = TOPICS[process.argv[3] ?? 'biologia'];
const paras = topic.paras;
function wrap(text, size, width) {
  const words = text.split(' '); const lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (font.widthOfTextAtSize(t, size) > width) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line); return lines;
}
for (let p = 1; p <= 4; p++) {
  const page = doc.addPage([595, 842]);
  let y = 780;
  page.drawText(`Unidad ${p}: ${topic.title}`, { x: 60, y, size: 22, font: bold }); y -= 40;
  for (let k = 0; k < 3; k++) for (const para of paras) {
    for (const l of wrap(para, 12, 475)) { page.drawText(l, { x: 60, y, size: 12, font, color: rgb(0.1,0.1,0.1) }); y -= 17; }
    y -= 8; if (y < 80) break;
  }
}
writeFileSync(process.argv[2], await doc.save());
