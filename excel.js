/* Exporta un Excel real (.xlsx), completamente offline y sin dependencias externas.
 * La pestaña 'Datos app' permite restaurar de forma exacta los datos exportados.
 * Usamos ZIP sin compresión para poder leerlo sin APIs externas en Safari iOS.
 */
(() => {
  'use strict';
  const enc = new TextEncoder();
  const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const xml = (value) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  function base64(bytes) {
    let result = '';
    for (let i = 0; i < bytes.length; i += 12000) result += String.fromCharCode(...bytes.subarray(i, i+12000));
    return btoa(result);
  }
  function debase64(s) {
    const binary = atob(s), output = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) output[i] = binary.charCodeAt(i);
    return output;
  }
  function col(i) {
    let s = '';
    for (i++; i > 0; i = Math.floor((i-1)/26)) s = String.fromCharCode(65+(i-1)%26) + s;
    return s;
  }
  function worksheet(headers, rows, widths, opts = {}) {
    const all = [headers, ...rows], count = headers.length;
    const columns = `<cols>${Array.from({length: count},(_,i) => `<col min="${i+1}" max="${i+1}" width="${widths?.[i]||18}" customWidth="1"/>`).join('')}</cols>`;
    const body = all.map((row,i)=>{
      const cells = row.map((value,j)=>{
        if (value == null || value === '') return '';
        const ref = `${col(j)}${i+1}`;
        if (typeof value==='number' && Number.isFinite(value)) return `<c r="${ref}" s="${i===0?1:(opts.numericFormat && opts.numericFormat.includes(j)?2:0)}"><v>${value}</v></c>`;
        return `<c r="${ref}" s="${i===0?1:0}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
      }).join('');
      return `<row r="${i+1}"${i===0?' ht="25" customHeight="1"':''}>${cells}</row>`;
    }).join('');
    const filter = opts.autoFilter && rows.length ? `<autoFilter ref="A1:${col(count-1)}${rows.length+1}"/>` : '';
    const lastcol=col(count-1);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`+
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastcol}${all.length}"/>`+
      `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`+
      `<sheetFormatPr defaultRowHeight="17"/>${columns}<sheetData>${body}</sheetData>${filter}</worksheet>`;
  }
  // PKZIP con método STORE, válido en Excel, Numbers y LibreOffice.
  const CRC = (()=>{
    const t = new Uint32Array(256);
    for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}
    return (bytes)=>{let c=0xFFFFFFFF;for(const b of bytes)c=t[(c^b)&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;};
  })();
  const u16 = (v,x,n) => v.setUint16(x,n,true), u32 = (v,x,n) => v.setUint32(x,n>>>0,true);
  function zip(files) {
    const chunks=[], directory=[]; let offset=0;
    const push = (a) => {chunks.push(a);offset+=a.byteLength;};
    for(const [name, content] of files){
      const n=enc.encode(name), data=enc.encode(content), crc=CRC(data), start=offset;
      const head=new Uint8Array(30+n.length),v=new DataView(head.buffer);
      u32(v,0,0x04034b50);u16(v,4,20);u16(v,6,0x0800);u16(v,8,0);u16(v,10,0);u16(v,12,0);
      u32(v,14,crc);u32(v,18,data.length);u32(v,22,data.length);u16(v,26,n.length);u16(v,28,0);
      head.set(n,30);push(head);push(data);
      directory.push({n, data, crc, start});
    }
    const directoryStart=offset;
    for(const {n,data,crc,start} of directory){
      const a=new Uint8Array(46+n.length),v=new DataView(a.buffer);
      u32(v,0,0x02014b50);u16(v,4,20);u16(v,6,20);u16(v,8,0x0800);u16(v,10,0);u16(v,12,0);u16(v,14,0);
      u32(v,16,crc);u32(v,20,data.length);u32(v,24,data.length);u16(v,28,n.length);
      u16(v,30,0);u16(v,32,0);u16(v,34,0);u16(v,36,0);u32(v,38,0);u32(v,42,start);
      a.set(n,46);push(a);
    }
    const end=new Uint8Array(22),v=new DataView(end.buffer);
    u32(v,0,0x06054b50);u16(v,4,0);u16(v,6,0);u16(v,8,directory.length);u16(v,10,directory.length);
    u32(v,12,offset-directoryStart);u32(v,16,directoryStart);u16(v,20,0);push(end);
    const out=new Uint8Array(offset);let pos=0;
    for(const chunk of chunks){out.set(chunk,pos);pos+=chunk.length;}
    return out;
  }
  function build(db) {
    const now=new Date().toISOString();
    const data={...db, backupDate:now};
    const sourceJSON=base64(enc.encode(JSON.stringify(data)));
    const slices=sourceJSON.match(/.{1,12000}/g) || [];
    const names=new Map(db.routines.map(r=>[r.id,r.name]));
    const exercises=new Map(db.routines.map(r=>[r.id,new Map(r.exercises.map(e=>[e.id,e.name]))]));
    const routineRows=db.routines.flatMap(r=>r.exercises.map((e,i)=>[r.name,i+1,e.name,e.archived?'Archivado':'Activo',r.id,e.id]));
    const sessionRows=db.sessions.flatMap(s=>{
      const entries=Object.entries(s.entries||{});
      return (entries.length?entries:[['','']]).map(([id,text])=>[Number(s.week)||0,s.date||'',names.get(s.routineId)||s.routineId,exercises.get(s.routineId)?.get(id)||id,text,s.notes||'',s.source||'',s.id]);
    }).sort((a,b)=>b[0]-a[0]||String(b[1]).localeCompare(String(a[1])));
    const weights=db.weights.map(w=>[Number(w.week)||0,w.date||'',Number(w.day)==null?'':(['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][Number(w.day)]||''),Number(w.kg),w.source||'',w.id]);
    weights.sort((a,b)=>b[0]-a[0]||String(b[1]).localeCompare(String(a[1])));
    const resumen=[
      ['Mi Entreno · Copia de datos', 'Exportado desde iPhone, sin servidor'],
      ['Fecha de exportación',now],['Rutinas',db.routines.length],
      ['Ejercicios',routineRows.length],['Sesiones',db.sessions.length],['Registros de peso',db.weights.length],
      ['Semana activa',Number(db.activeWeek)||1],
      ['Información','No incluye la primera pestaña de dieta'],
      ['Restauración','Importa este Excel desde Ajustes de Mi Entreno; no borres la hoja Datos app'],
      ['Privacidad','Archivo privado: contiene tus marcas y tus pesos']
    ];
    const full=[
      ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${[1,2,3,4,5].map(i=>`<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
      ['_rels/.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${['Resumen','Rutinas','Entrenamientos','Pesos','Datos app'].map((n,i)=>`<sheet name="${xml(n)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[1,2,3,4,5].map(i=>`<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join('')}<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml',`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="0"/><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FF122031"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC8F46B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
      ['xl/worksheets/sheet1.xml',worksheet(['Concepto','Detalle'],resumen,[37,85])],
      ['xl/worksheets/sheet2.xml',worksheet(['Rutina','Orden','Ejercicio','Estado','ID rutina','ID ejercicio'],routineRows,[22,10,42,14,25,28],{autoFilter:true})],
      ['xl/worksheets/sheet3.xml',worksheet(['Semana','Fecha','Rutina','Ejercicio','Registro / series','Notas','Origen','ID sesión'],sessionRows,[12,17,22,42,52,48,15,38],{autoFilter:true})],
      ['xl/worksheets/sheet4.xml',worksheet(['Semana','Fecha','Día','Peso (kg)','Origen','ID registro'],weights,[12,17,17,16,15,38],{autoFilter:true,numericFormat:[3]})],
      ['xl/worksheets/sheet5.xml',worksheet(['Campo','Valor'],[['Aviso','NO BORRAR. Se necesita para restaurar exactamente todos los registros.'],['Formato','Mi Entreno ZIP-STORE, versión 1'], ...slices.map((part,i)=>[`Bloque ${i+1}`,part])],[25,102])]
    ];
    return {name:'mi-entreno.xlsx',mime:MIME,bytes:zip(full),sessionRows:sessionRows.length,weights:weights.length};
  }
  function restore(buffer) {
    const a = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const v=new DataView(a.buffer,a.byteOffset,a.byteLength);
    let p=0, found=null;
    while(p+30<=a.length && v.getUint32(p,true)===0x04034b50){
      const method=v.getUint16(p+8,true),size=v.getUint32(p+18,true),nameLen=v.getUint16(p+26,true),extraLen=v.getUint16(p+28,true);
      const fileName=new TextDecoder().decode(a.subarray(p+30,p+30+nameLen)),start=p+30+nameLen+extraLen;
      if(start+size>a.length)throw Error('El Excel está incompleto.');
      if(fileName==='xl/worksheets/sheet5.xml'){
        if(method!==0)throw Error('Importa el Excel creado por Mi Entreno, sin volver a guardarlo desde otra app.');
        found=new TextDecoder().decode(a.subarray(start,start+size));break;
      }
      p=start+size;
    }
    if(!found)throw Error('Este archivo no contiene una copia recuperable de Mi Entreno. Usa un Excel exportado desde la app.');
    const doc=new DOMParser().parseFromString(found,'application/xml');
    if(doc.getElementsByTagName('parsererror').length)throw Error('No se pudo leer el Excel.');
    const rows=Array.from(doc.getElementsByTagName('row'));
    const chunks=[];
    for(const row of rows){
      const cells=Array.from(row.getElementsByTagName('c'));
      if(cells.length<2)continue;
      const label=cells[0].textContent||'';
      if(/^Bloque \d+$/.test(label))chunks.push([Number(label.slice(6)),cells[1].textContent||'']);
    }
    if(!chunks.length)throw Error('No se han encontrado los datos de recuperación.');
    chunks.sort((a,b)=>a[0]-b[0]);
    const json=new TextDecoder().decode(debase64(chunks.map(x=>x[1]).join('')));
    return JSON.parse(json);
  }
  window.ENTRENO_EXCEL={build,restore,MIME};
})();
