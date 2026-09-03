# dsh-client-ui-usage — Plugin de análisis de uso para DeepSeek Harness

> 🌐 Languages: [中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Español** · [Français](README.fr.md) · [Deutsch](README.de.md)

[![GitHub release](https://img.shields.io/github/v/release/woosh2010/dsh-usage-dashboard?label=release)](https://github.com/woosh2010/dsh-usage-dashboard/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/woosh2010/dsh-usage-dashboard?style=social)](https://github.com/woosh2010/dsh-usage-dashboard/stargazers)

![Demostración](docs/demo.gif)


Añade un **dock de facturación por hora punta/valle** debajo del cuadro de entrada de la Web de [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh web`); al hacer clic se expande el **panel de análisis de uso** completo: los datos de token / coste / modelo / punta-valle de todas las sesiones se guardan automáticamente en disco, con filtros globales y gráficos multidimensionales.

![Panel de análisis de uso](docs/screenshots/dashboard.png)

> Nota: las capturas de pantalla muestran la interfaz en chino.

## Características

- **Facturación por tramos punta/valle**: calcula el coste según las horas punta de Pekín (9:00–12:00 / 14:00–18:00) y las horas valle (mitad de precio); el dock muestra en tiempo real el tramo actual, la barra de progreso, la cuenta atrás hasta el próximo cambio de precio, el coste acumulado de la sesión / del turno actual y el saldo de la cuenta (refresco automático cada 60 segundos a través del proxy oficial `/user/balance`; la API Key nunca sale del navegador).

  ![Dock plegado](docs/screenshots/dock.png)

- **Persistencia del historial**: cada paso escribe automáticamente token / coste / modelo / punta-valle en `~/.dsh/storages/usage-history.jsonl`, conservándose entre sesiones y reinicios (límite flexible de 40 000 registros con recorte automático de los más antiguos).
- **Filtros globales**: opciones globales en la parte superior del panel; todos los gráficos y tarjetas de estadísticas se actualizan en tiempo real—
  - Rango de tiempo: hoy / 7 días / 30 días / 90 días / todo
  - Rango de sesión: todas las sesiones / esta sesión
  - Filtro por modelo: todos los modelos / un modelo concreto
- **Tarjetas de estadísticas**: coste (con desglose punta/valle), tokens (con entrada/salida), turnos (con punta/valle), tasa de aciertos de caché, ahorro en horas valle, media por paso.
- **Gráficos de análisis**:
  - Línea de tendencia de coste (al pasar el cursor se ve el coste del día y el desglose punta/valle)
  - Gráfico de anillo de la estructura de tokens (con conmutación «todo / por modelo»)
  - Gráfico de barras de distribución por modelo (nombre completo del modelo + porcentaje de coste)
  - Comparación punta/valle y ahorro en horas valle
- **Registros recientes**: todos los pasos de los últimos **20 turnos** (plegados por defecto, agrupados por turno, con el título del turno mostrando la insignia del modelo, punta/valle y coste; admite expandir/plegar todo, con desplazamiento dentro del área).

  ![Registros recientes](docs/screenshots/recent.png)

- **Cierre al hacer clic fuera**: el panel se renderiza mediante un portal de React; se cierra al hacer clic en cualquier punto fuera del panel o al pulsar Esc.

## Requisitos

- El `web` profile de DeepSeek Harness (dsh) `0.1.1-rc.1`
- La visualización del saldo requiere haber configurado una DeepSeek API Key en la página de ajustes del modelo (si no está configurada, el saldo se muestra como «—»; el resto de funciones no se ven afectadas)

## Instalación

### Opción 1: Instalación en un solo paso (recomendada)

> Se requiere **pnpm** (`dsh plugin` reenvía los argumentos tal cual a pnpm, que se ejecuta en el directorio del profile).
> Si no lo tienes, instálalo primero: `corepack enable pnpm` (Node incluye corepack) o `npm install -g pnpm`.

Un único comando instala directamente el tarball del GitHub Release (verificado en funcionamiento):

```bash
dsh plugin --profile web add https://github.com/woosh2010/dsh-usage-dashboard/releases/download/v0.4.0/deepseek-ai-dsh-client-ui-usage-0.4.0.tgz
```

El paquete declara `dsh.bundle.patch`; `dsh plugin` escribe automáticamente `@deepseek-ai/dsh-client-ui-usage` en la lista `dsh.profile.bundles` del profile y lo monta como la entrada `ui-usage`. Después reinicia `dsh web` y refresca el navegador.

> **Si vienes de la opción 2/3**: elimina primero la línea `ui-usage` insert añadida a mano en `~/.dsh/profiles/web/cordis.patch.yml`; de lo contrario, el id de la entrada del bundle patch y el del insert manual entrarán en conflicto por duplicado.

### Opción 2: Descargar primero y luego instalar (sin conexión / intranet)

1. Descarga el paquete de instalación (el tgz de [Releases](https://github.com/woosh2010/dsh-usage-dashboard/releases), o `curl -LO <la URL anterior>`; también puedes hacer `git clone` y luego `npm pack` para generarlo tú mismo).
2. Ejecuta en el directorio donde está el tgz (atención al `./` o a la ruta absoluta delante del nombre: si escribes solo el nombre del archivo, pnpm lo tratará como un nombre de paquete npm):

   ```bash
   dsh plugin --profile web add ./deepseek-ai-dsh-client-ui-usage-0.4.0.tgz
   ```

### Opción 3: Instalación manual

1. Extrae el tarball en la ruta de resolución del profile:

   ```bash
   mkdir -p ~/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-usage
   tar -xzf deepseek-ai-dsh-client-ui-usage-0.4.0.tgz --strip-components=1 \
     -C ~/.dsh/profiles/node_modules/@deepseek-ai/dsh-client-ui-usage
   ```

2. Añade una entrada en `~/.dsh/profiles/web/cordis.patch.yml`:

   ```yaml
   - insert:
       - id: ui-usage
         name: '@deepseek-ai/dsh-client-ui-usage'
   ```

3. Reinicia `dsh web` y refresca el navegador.

> Uso directo desde el directorio de código fuente: `lib/client.js` lo lee el servidor directamente del archivo, por lo que los cambios en el cliente se aplican al refrescar el navegador; los cambios en `lib/index.js` (rutas/almacenamiento del lado host) requieren reiniciar `dsh web`.

## Preguntas frecuentes (solución de problemas)

### `dsh web` no inicia con el error "declares no dsh.bundle" tras actualizar/instalar

**Síntoma**: al reiniciar `dsh web` se produce el error:

```
profile bundle "@deepseek-ai/dsh-client-ui-usage" declares no dsh.bundle in its package.json
```

**Causas** (por frecuencia):

1. **Una instalación antigua 0.1.x (declara solo `dsh.client`, sin `dsh.bundle`) está tapando la nueva versión.**
   La v0.4.0 declara `dsh.bundle.patch`, por lo que registrarla en `bundles` es totalmente válido. Sin embargo,
   al resolver el paquete desde el directorio del perfil, un **enlace simbólico** dentro de
   `~/.dsh/profiles/web/node_modules/@deepseek-ai/` (que apunta a una copia antigua en `web/packages/`)
   tiene prioridad sobre los archivos nuevos en `~/.dsh/profiles/node_modules/@deepseek-ai/` (el ámbito
   compartido); la validación lee entonces el package.json antiguo y notifica `declares no dsh.bundle`.
   Es habitual al actualizar desde una instalación manual antigua que copiaba fuentes en `web/packages/`.
2. **El nombre del paquete se añadió a mano a `dsh.profile.bundles`** (edición manual del package.json del
   perfil, resolviendo a una versión sin declaración `dsh.bundle`). El registro de bundles debe dejarse en
   manos de `dsh plugin add`: no lo edite manualmente.

**Soluciones**:

1. Elimine los restos antiguos: borre o reemplace `~/.dsh/profiles/web/packages/dsh-client-ui-usage` y su
   enlace simbólico en `~/.dsh/profiles/web/node_modules/@deepseek-ai/`, de modo que todas las rutas de
   resolución apunten a la v0.4.0 (que declara `dsh.bundle`).
2. Reinstale con el comando oficial (reconcilia el registro de bundles y las dependencias):

   ```bash
   dsh plugin --profile web add https://github.com/woosh2010/dsh-usage-dashboard/releases/download/v0.4.0/deepseek-ai-dsh-client-ui-usage-0.4.0.tgz
   ```

3. Si antes montó el paquete con un `insert` escrito a mano en el `cordis.patch.yml` del perfil, conserve
   **solo uno** de los dos mecanismos (prefiera el registro oficial de bundles y borre el insert manual)
   para evitar conflictos de montaje duplicado.
4. Reinicie `dsh web` y haga una recarga forzada del navegador.

> También aplica al migrar de equipo: los scripts auxiliares que instalan fuentes antiguas en
> `web/packages/` (p. ej. mediante enlaces simbólicos) deben limpiarse antes de actualizar este plugin,
> o provocarán el problema de sombreado de resolución descrito arriba.

### Autocomprobación rápida para otros problemas de instalación

Simula localmente la validación de `bundles` al arrancar (comprueba que cada bundle declare `dsh.bundle`
y que ningún paquete solo-cliente haya entrado en `bundles`):

```bash
node -e '
const fs=require("fs"),path=require("path");
const D=path.join(process.env.HOME,".dsh/profiles/web");
const j=JSON.parse(fs.readFileSync(path.join(D,"package.json"),"utf8"));
let ok=true;
for(const n of j.dsh.profile.bundles){
  const m=JSON.parse(fs.readFileSync(require.resolve(n+"/package.json",{paths:[D]}),"utf8"));
  const has=!!(m.dsh&&m.dsh.bundle);
  console.log((has?"✓":"✗")+" "+n+" "+m.version); if(!has)ok=false;
}
const bad=["@deepseek-ai/dsh-client-ui-usage","@deepseek-ai/dsh-client-ui-gitpush"]
  .filter(n=>j.dsh.profile.bundles.includes(n));
if(bad.length)console.log("✗ paquete solo-cliente en bundles:",bad),ok=false;
console.log(ok?"✅ Comprobación superada":"❌ Comprobación fallida"); process.exit(ok?0:1);
'
```

## Verificación

Después de desplegar, ejecuta:

```bash
node verify.mjs          # por defecto http://127.0.0.1:3080; puede pasar un argumento baseUrl
```

El script comprueba: que el archivo de cliente servido coincide con el desplegado, `modelsAll` y la estructura de tokens por modelo, el filtrado por sesión/modelo, los últimos 20 turnos y que la suma de los mix de cada modelo es igual al total.

## Datos y explicación de la facturación

- **Almacenamiento del historial**: `~/.dsh/storages/usage-history.jsonl`, con un límite flexible de 40 000 registros y recorte automático de los más antiguos; los registros con modelo desconocido se corrigen automáticamente (recalculando el precio) cuando la caché de proyección está disponible.
- **Tabla de precios**: la `PRICE_TABLE` integrada en `lib/client.js` y `lib/index.js` (yuanes/millón de tokens, con dos tramos punta/valle; los aciertos de caché se cobran al precio de acierto y las escrituras al precio de entrada). Cuando DeepSeek ajuste los precios, basta con actualizar estos dos sitios.
- **Ahorro en horas valle**: las horas valle se facturan a la mitad del precio de las horas punta; `ahorro en horas valle = coste acumulado en horas valle`.

## Regenerar las capturas de pantalla

Las capturas de `docs/screenshots/` provienen de un `dsh web` real en ejecución (las cifras del saldo están ocultadas). Para regenerarlas:

```bash
# 1. Inicia Chrome sin interfaz (puerto de depuración 9222)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9222 --remote-allow-origins=* \
  --user-data-dir=/tmp/dsh-shot-profile --window-size=1440,900 about:blank

# 2. Captura (puedes definir DSH_CONV para indicar el nombre de la sesión de la barra lateral)
node scripts/screenshots.mjs dock
node scripts/screenshots.mjs dashboard
node scripts/screenshots.mjs recent
```

## Historial de versiones

- **0.4.0**: filtros globales (rango de tiempo de 5 niveles / todo·esta sesión / filtro por modelo), conmutación de la estructura de tokens por modelo, distribución por modelo con el nombre completo, últimos 20 turnos (parámetro `turns`), información secundaria en las tarjetas de estadísticas y un diseño más compacto, cierre al hacer clic fuera (portal + máscara) y registros recientes plegados por defecto.
- **0.3.3 / 0.1.0**: dock inicial de facturación punta/valle, proxy de saldo de cuenta, historial JSONL y gráficos agregados.

## License

[MIT](LICENSE)
