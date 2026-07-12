# 24fire Server-Verwaltung

Ein Dashboard zur Verwaltung deiner [24fire](https://24fire.de) KVM-Server über die
offizielle **24fire REST-API v2** – mit Health-Checks, Auslastung (CPU/RAM/Ping),
Traffic, Backups, DDoS-Schutz sowie Domain- & DNS-Verwaltung.

## Tech-Stack

- **React 18 + Vite** – Frontend
- **Tailwind CSS + [shadcn/ui](https://ui.shadcn.com/)** – UI-Komponenten (Radix-basiert)
- **recharts** – Diagramme (CPU, RAM, Ping, Traffic)
- **Express** – schlanker API-Proxy, damit der API-Key **serverseitig** bleibt

## Sicherheit

Der 24fire-API-Key wird **niemals** an den Browser gesendet. Das Frontend spricht nur
mit dem eigenen Express-Proxy unter `/api`, der die Anfragen mit dem Key serverseitig
an 24fire weiterleitet.

Für den öffentlichen Betrieb gibt es einen **Passwortschutz** (`DASHBOARD_PASSWORD`):
Dann verlangen alle API-Routen, die SSH-Konsole und die Docker-Funktionen einen
gültigen, signierten Token. **SSH-Zugangsdaten** (Passwort/Schlüssel) werden nur für
die Dauer der Verbindung im Speicher gehalten – nie gespeichert und nie geloggt
(protokolliert werden ausschließlich Metadaten wie Zeit, IP, Host, Benutzer, Ergebnis).

## Einrichtung

1. **Abhängigkeiten installieren**

   ```bash
   npm install
   ```

2. **API-Key hinterlegen** – Datei `.env` im Projektordner anlegen (Vorlage: `.env.example`):

   ```env
   FIRE_API_KEY=dein_24fire_api_key
   # Login-Passwort (leer = Login deaktiviert, nur lokal sinnvoll):
   DASHBOARD_PASSWORD=
   # Secret für Login-Tokens (z. B. mit: openssl rand -hex 32):
   AUTH_SECRET=
   # optional:
   PORT=3001
   MET_HEALTH_URL=https://met.example.com/api/health
   DISCORD_HEALTH_URL=https://discord.example.com/api/health
   LARRYS_HEALTH_URL=https://larrys.example.com/api/health
   POLENSTUBE_HEALTH_URL=https://polenstube.example.com/api/health
   HEALTH_CHECK_INTERVAL_MS=30000
   HEALTH_CHECK_TIMEOUT_MS=5000
   DISCORD_UPDATE_WEBHOOK_URL=https://discord.com/api/webhooks/...
   GITHUB_WEBHOOK_SECRET=ein_langes_zufälliges_secret
   GITHUB_UPDATE_REPOSITORIES=organisation/met-app,organisation/larrys
   GITHUB_UPDATE_BRANCHES=main,master
   ```

   Den API-Key findest du im [24fire Control Panel](https://manage.24fire.de) unter
   deinem Account bzw. dem jeweiligen Server. Die Health-URLs müssen vom Prozess der
   Serververwaltung erreichbar sein. Ohne URL bleibt der Dienst im Dashboard sichtbar
   und wird als „Nicht konfiguriert“ markiert.

3. **Entwicklung starten** (Frontend auf Port 5174 + API-Proxy auf Port 3001):

   ```bash
   npm run dev
   ```

4. **Produktion** – Build erstellen und über Express ausliefern:

   ```bash
   npm run build
   npm start
   ```

## Skripte

| Befehl            | Beschreibung                                        |
| ----------------- | --------------------------------------------------- |
| `npm run dev`     | Startet API-Proxy und Vite-Dev-Server gleichzeitig  |
| `npm run server`  | Nur den Express-API-Proxy starten                   |
| `npm run web`     | Nur den Vite-Dev-Server starten                     |
| `npm run build`   | Produktions-Build nach `dist/`                      |
| `npm start`       | Express-Server (liefert auch das gebaute Frontend)  |

## Funktionen

- **Dashboard** – Übersicht aller Server mit Status, CPU-/RAM-Auslastung und Ping
- **Dienstestatus** – Healthchecks für MET, Discord Bot, Larry's und Polenstube mit
   Antwortzeit, Uptime, P95-Latenz und Ausfallzähler
- **Server-Detail** – Übersicht, Monitoring, Traffic, Backups, DDoS, Docker & Konsole je Server
- **Power-Steuerung** – Start / Neustart / Stopp
- **Backups** – erstellen, wiederherstellen, löschen
- **SSH-Konsole** – Web-Terminal (xterm.js) mit direkter SSH-Verbindung zum Server
- **Docker** – Container-Status & Live-Auslastung sowie Detailansicht je Container:
  Start/Stopp/Neustart, Image neu ziehen, Logs, CPU-/RAM-Diagramm, Netzwerke, Ports,
  Volumes und (maskierte) Env-Variablen
- **Zugriffe / Logging** – Protokoll aller SSH-, Docker- und Login-Zugriffe
  (Zeit, IP, Aktion, Host, Benutzer, Ergebnis)
- **Login** – optionaler Passwortschutz mit Token; sichert API, SSH-Konsole & Docker ab
- **Update-Freigaben** – GitHub-Pushes prüfen, als Discord-Embed veröffentlichen oder verwerfen
- **Domains & DNS** – DNS-Einträge anlegen, bearbeiten, löschen
- **Account** – Kontodaten, Guthaben, 24fire+, Spenden, Affiliate

## Deployment (Docker + Caddy)

> Für GitHub-Deployment über **Portainer**, **Cloudflare** und **Nginx Proxy Manager**
> siehe [DEPLOYMENT_PORTAINER.md](DEPLOYMENT_PORTAINER.md). Dafür wird die separate
> `docker-compose.portainer.yml` ohne Caddy verwendet.

Für den öffentlichen Betrieb liegt ein fertiges Setup mit automatischem HTTPS
(Caddy + Let's Encrypt) bei – vorausgesetzt, auf dem Server läuft Docker.

1. **DNS**: Einen A-Record deiner (Sub-)Domain auf die Server-IP zeigen lassen.

2. **Code auf den Server holen**:

   ```bash
   git clone <DEIN_REPO> serververwaltung
   cd serververwaltung
   ```

3. **Konfiguration anlegen** – `.env` aus der Vorlage erstellen und ausfüllen:

   ```bash
   cp .env.example .env
   nano .env
   ```

   | Variable             | Bedeutung                                                       |
   | -------------------- | --------------------------------------------------------------- |
   | `FIRE_API_KEY`       | 24fire API-Key (Pflicht)                                        |
   | `DASHBOARD_PASSWORD` | Login-Passwort fürs Dashboard (Pflicht im öffentlichen Betrieb) |
   | `AUTH_SECRET`        | Zufälliges Secret für Login-Tokens (`openssl rand -hex 32`)     |
   | `DOMAIN`             | Deine Domain für HTTPS, z. B. `dashboard.example.com`           |
   | `*_HEALTH_URL`       | Erreichbarer `/api/health`-Endpunkt des jeweiligen Dienstes     |
   | `HEALTH_CHECK_INTERVAL_MS` | Prüfintervall in Millisekunden (Standard: `30000`)        |
   | `HEALTH_CHECK_TIMEOUT_MS`  | Timeout pro Prüfung in Millisekunden (Standard: `5000`)   |

4. **Starten**:

   ```bash
   docker compose up -d --build
   ```

   Danach ist das Dashboard unter `https://<DOMAIN>` erreichbar (Caddy holt das
   Zertifikat automatisch).

5. **Updates einspielen**:

   ```bash
   git pull
   docker compose up -d --build
   ```

**Nützliche Befehle**

```bash
docker compose logs -f app     # Server-Logs live
docker compose restart app     # App neu starten
docker compose down            # alles stoppen
```

> Ohne eigene Domain kannst du den `caddy`-Dienst in der `docker-compose.yml` weglassen
> und stattdessen beim `app`-Dienst `ports: ["3001:3001"]` ergänzen. Dann ist das
> Dashboard unter `http://<SERVER-IP>:3001` erreichbar (unverschlüsselt).

## shadcn/ui

Die UI-Primitives liegen unter `src/components/ui/` (Button, Card, Dialog, Tabs,
Select, Table, …) und folgen der shadcn-Konvention (`components.json`). Projektspezifische
Composite-Komponenten (Loading, ErrorState, StatCard, UsageBar, Modal, …) bauen in
`src/components/ui.jsx` darauf auf.

> Hinweis: Einige Endpunkte (z. B. Monitoring) setzen ein aktives **24fire+**-Abo voraus.

## GitHub-Updates im Discord-Kanal

Die Serververwaltung sammelt Updates aller Websites zentral zur Freigabe. Erst nach
einem Klick auf `Updates > Veröffentlichen` sendet sie die Commit-Nachrichten in den
Discord-Kanal. Unwichtige Änderungen können stattdessen verworfen werden. Der
Discord-Webhook tritt dabei unter dem Namen des jeweiligen GitHub-Repositories auf;
die einzelnen Discord-Bots brauchen dafür keine zusätzliche Logik.

1. In Discord unter `Kanal bearbeiten > Integrationen > Webhooks` einen Webhook für
   den Update-Kanal erstellen und dessen URL als `DISCORD_UPDATE_WEBHOOK_URL` setzen.
2. Ein langes zufälliges Secret erzeugen, zum Beispiel mit `openssl rand -hex 32`,
   und als `GITHUB_WEBHOOK_SECRET` setzen.
3. Die erlaubten Repositories vollständig in `GITHUB_UPDATE_REPOSITORIES` eintragen,
   zum Beispiel `organisation/met-app,organisation/larrys,organisation/polenstube`.
4. In jedem Repository unter `Settings > Webhooks > Add webhook` eintragen:
   - Payload URL: `https://DEINE-SERVERVERWALTUNG/api/webhooks/github`
   - Content type: `application/json`
   - Secret: derselbe Wert wie `GITHUB_WEBHOOK_SECRET`
   - Events: `Just the push event`
5. Serververwaltung neu starten. GitHubs `Ping` muss danach mit HTTP 200 beantwortet
   werden. Pushes auf `main` oder `master` erscheinen unter `Updates` zur Freigabe.
6. Den Inhalt prüfen und `Veröffentlichen` oder `Verwerfen` wählen. Vor dem Senden
   zeigt die Verwaltung einen zusätzlichen Bestätigungsdialog.

Weitere produktive Branches lassen sich kommasepariert über
`GITHUB_UPDATE_BRANCHES` freigeben. Andere Events, Branch-Löschungen und doppelt
zugestellte GitHub-Events werden ohne Discord-Nachricht quittiert.
