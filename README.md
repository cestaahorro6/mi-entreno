# Mi Entreno para iPhone (offline, exportación Excel)

App web instalable (PWA) basada en tu Excel original, **sin la pestaña DIETA_COMPRA**. Incluye las 6 rutinas y 36 ejercicios. El historial personal de 250 entrenamientos y 214 pesajes se entrega en un JSON separado, para que no publiques tus datos por error.

## Instalación en iPhone

**Para instalar una web app en iPhone hace falta abrirla al menos una vez desde una dirección HTTPS.** No necesita servidor de aplicación, base de datos ni backend; solo un alojamiento *estático* gratuito que sirva los archivos iniciales, por ejemplo GitHub Pages (o Render Static Site). La app descargada se almacena en caché y se usa después sin conexión.

1. Crea un repositorio en GitHub, sube los archivos del ZIP (NO subas el archivo JSON con tu historial) y activa **Settings → Pages → Deploy from a branch → main → / (root)**. GitHub te dará una URL `https://usuario.github.io/repositorio/`.
2. Abre esa URL en **Safari** del iPhone, con conexión. Toca **Compartir → Añadir a pantalla de inicio** y abre el icono creado.
3. En **Ajustes → Restaurar desde JSON**, elige `mi-entreno-historial-privado.json` desde Archivos del iPhone. La app recuperará tus entrenamientos y pesajes. No subas este JSON a GitHub.
4. Registra una sesión o un peso. Se guarda automáticamente **en el almacenamiento local de esta instalación**, aunque no haya conexión.
5. Pulsa **Excel** (arriba) o **Guardar Excel**. En la hoja para compartir de iOS pulsa **Guardar en Archivos** y elige la carpeta deseada (En mi iPhone o iCloud Drive). Puedes reemplazar un archivo si el diálogo de iOS ofrece esa opción, pero **Safari no puede sobrescribir sin intervención el mismo Excel externo**.
6. En **Ajustes → Restaurar desde Excel** puedes recuperar un `.xlsx` generado por la app. Mantén intacta la pestaña **Datos app** del Excel para restaurar todos los detalles, y no lo guardes de nuevo desde Numbers/Excel si quieres restaurarlo en la app.

## Qué se guarda y qué no

- Los registros se guardan automáticamente en el móvil; no se envían a GitHub, Render ni a terceros.
- Al tocar **Guardar Excel** se genera un `.xlsx` verdadero con pestañas **Resumen, Rutinas, Entrenamientos, Pesos y Datos app**. No incluye dieta.
- **Limitación iPhone:** ninguna PWA web puede vincular y sobrescribir en silencio un archivo arbitrario en la app Archivos. Cada exportación requiere confirmar el guardado en Archivos. Si necesitas sobrescritura real de un mismo fichero sin confirmar, sería necesaria una app iOS nativa con acceso autorizado al archivo (con un proyecto Swift/Xcode).
- El almacenamiento local puede desaparecer si borras la app, su contenido o los datos de Safari; por seguridad exporta Excel regularmente y conserva más de una copia.
- Para probar que funciona sin internet, **instálala y ábrela al menos una vez online antes de activar modo avión**.

## Privacidad

El ZIP no contiene marcas ni pesos personales. Usa el historial privado JSON solo dentro de la app. No lo publiques.
