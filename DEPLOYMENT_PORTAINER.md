# Deployment mit Portainer, Cloudflare und Nginx Proxy Manager

Diese Anleitung installiert die Serververwaltung direkt aus dem GitHub-Repository.
Nginx Proxy Manager (NPM) übernimmt Domain, HTTPS und die Weiterleitung. Der im
normalen `docker-compose.yml` enthaltene Caddy wird dabei nicht verwendet.

## Voraussetzungen

- Ein Linux-Server mit Docker und Portainer im Modus `Docker Standalone`
- Nginx Proxy Manager läuft bereits als Container
- Ports `80` und `443` zeigen auf Nginx Proxy Manager
- Eine Domain wird über Cloudflare verwaltet
- Das GitHub-Repository enthält `docker-compose.portainer.yml`

Bei Docker Swarm muss stattdessen vorab ein fertiges Image in eine Registry gebaut
werden, da Swarm-Stacks die lokale `build:`-Anweisung nicht verwenden.

## 0. Änderungen nach GitHub übertragen

Portainer kann nur Dateien abrufen, die bereits im GitHub-Repository liegen. Im
lokalen Projektordner zunächst den aktuellen Stand committen und pushen:

```bash
git add .
git commit -m "Add health monitoring and Portainer deployment"
git push origin main
```

Falls der Branch anders heißt, `main` entsprechend ersetzen. Die lokale `.env` wird
durch `.gitignore` ausgeschlossen und darf nicht mit Secrets nach GitHub gelangen.

## 1. Gemeinsames Docker-Netzwerk anlegen

NPM und die Serververwaltung müssen im selben Docker-Netzwerk liegen. In Portainer:

1. `Networks` öffnen.
2. `Add network` wählen.
3. Name `proxy` eintragen.
4. Driver `bridge` beibehalten und das Netzwerk erstellen.
5. Unter `Containers` den Nginx-Proxy-Manager-Container öffnen.
6. Bei `Connected networks` das Netzwerk `proxy` hinzufügen.

Nach einem späteren Redeploy von NPM prüfen, ob der Container weiterhin mit `proxy`
verbunden ist. Am stabilsten ist es, das externe Netzwerk zusätzlich in dessen Stack
einzutragen:

```yaml
services:
  app:
    networks:
      - default
      - proxy

networks:
  proxy:
    external: true
```

Der NPM-Dienst kann je nach Stack anders als `app` heißen.

## 2. Cloudflare-DNS einrichten

1. In Cloudflare die gewünschte Zone öffnen.
2. Unter `DNS` einen Record anlegen:
   - Type: `A`
   - Name: zum Beispiel `server`
   - IPv4 address: öffentliche IP des Servers
   - Proxy status: zunächst `DNS only` (graue Wolke)
3. Unter `SSL/TLS` den Modus `Full (strict)` einstellen. Niemals `Flexible` verwenden.

Damit lautet die spätere Adresse beispielsweise `server.example.com`.

## 3. Portainer-Stack aus GitHub erstellen

1. In Portainer `Stacks` und dann `Add stack` öffnen.
2. Einen Namen wie `serververwaltung` vergeben.
3. Als Build method `Repository` auswählen.
4. Repository URL eintragen, zum Beispiel:

   ```text
   https://github.com/DEIN-NAME/DEIN-REPOSITORY.git
   ```

5. Bei einem privaten Repository die GitHub-Zugangsdaten beziehungsweise einen
   Personal Access Token mit reinem Lesezugriff hinterlegen.
6. Repository reference auf den gewünschten Branch setzen, normalerweise
   `refs/heads/main`.
7. Compose path eintragen:

   ```text
   docker-compose.portainer.yml
   ```

8. Unter `Environment variables` die folgenden Werte anlegen:

| Name | Wert |
| --- | --- |
| `FIRE_API_KEY` | API-Key aus dem 24fire Control Panel |
| `DASHBOARD_PASSWORD` | Starkes Passwort für die Serververwaltung |
| `AUTH_SECRET` | Lange zufällige Zeichenfolge mit mindestens 32 Bytes |
| `MET_HEALTH_URL` | Zum Beispiel `https://met.example.com/api/health` |
| `DISCORD_HEALTH_URL` | Zum Beispiel `https://bot.example.com/api/health` |
| `LARRYS_HEALTH_URL` | Zum Beispiel `https://larrys.example.com/api/health` |
| `POLENSTUBE_HEALTH_URL` | Zum Beispiel `https://polenstube.example.com/api/health` |

Ein `AUTH_SECRET` kann lokal erzeugt werden:

```bash
openssl rand -hex 32
```

Die Health-URLs sind optional. Nicht gesetzte Dienste erscheinen im Dashboard als
`Nicht konfiguriert`. Geheimnisse gehören nur in die Portainer-Umgebungsvariablen,
nicht in GitHub.

9. `Deploy the stack` anklicken. Der erste Build kann einige Minuten dauern.
10. Unter `Containers` warten, bis `serververwaltung` den Status `healthy` erreicht.

Der Container veröffentlicht bewusst keinen Host-Port. NPM erreicht ihn intern über
das gemeinsame Netzwerk `proxy`.

## 4. Proxy Host in Nginx Proxy Manager

1. NPM öffnen und zu `Hosts` > `Proxy Hosts` gehen.
2. `Add Proxy Host` auswählen.
3. Im Bereich `Details` eintragen:
   - Domain Names: `server.example.com`
   - Scheme: `http`
   - Forward Hostname / IP: `serververwaltung`
   - Forward Port: `3001`
   - `Block Common Exploits`: aktivieren
   - `Websockets Support`: aktivieren
4. Im Bereich `SSL`:
   - `Request a new SSL Certificate` auswählen
   - `Force SSL` aktivieren
   - `HTTP/2 Support` aktivieren
   - E-Mail eintragen und Let's-Encrypt-Bedingungen akzeptieren
5. Proxy Host speichern.

Danach `https://server.example.com/api/health` öffnen. Erwartet wird JSON mit
`"service":"serververwaltung"` und `"status":"ok"` oder `"degraded"`.

Wenn das Zertifikat funktioniert, kann der Cloudflare DNS Record optional auf
`Proxied` (orange Wolke) gestellt werden. Der SSL-Modus bleibt `Full (strict)`.

## 5. Funktion prüfen

1. `https://server.example.com` öffnen und mit `DASHBOARD_PASSWORD` anmelden.
2. Im Dashboard den Bereich `Dienste` prüfen.
3. `Jetzt prüfen` anklicken.
4. Kontrollieren, ob Status, Latenz, Uptime, P95 und Ausfälle erscheinen.

Der Messverlauf liegt im Docker-Volume `serververwaltung_logs` und bleibt bei
Container-Updates erhalten.

## Updates aus GitHub einspielen

1. In Portainer den Stack `serververwaltung` öffnen.
2. `Pull and redeploy` beziehungsweise `Update the stack` auswählen.
3. `Re-pull image and redeploy` aktivieren, falls diese Option angezeigt wird.
4. Das Update bestätigen und anschließend den Health-Status kontrollieren.

Da das Image aus dem Repository gebaut wird, muss Portainer beim Update den aktuellen
Git-Stand abrufen und das Image neu bauen.

## Fehlerdiagnose

### Container wird nicht healthy

In Portainer `Containers` > `serververwaltung` > `Logs` öffnen. Zusätzlich in der
Container-Konsole prüfen:

```bash
node -e "fetch('http://127.0.0.1:3001/api/health').then(r => r.text()).then(console.log)"
```

### NPM zeigt 502 Bad Gateway

- NPM und `serververwaltung` müssen beide mit dem Netzwerk `proxy` verbunden sein.
- Forward Hostname muss exakt `serververwaltung` lauten.
- Forward Port ist `3001`, Scheme ist `http`.
- Nicht `localhost` oder die öffentliche Server-IP als Forward Host verwenden.

### Zertifikat kann nicht erstellt werden

- Cloudflare zunächst auf `DNS only` stellen.
- Ports `80` und `443` müssen aus dem Internet NPM erreichen.
- Es darf kein zweiter Proxy wie Caddy dieselben Ports belegen.
- Nach Ausstellung kann Cloudflare wieder auf `Proxied` gestellt werden.

### Web-Konsole verbindet sich nicht

- In NPM muss `Websockets Support` aktiviert sein.
- Cloudflare SSL/TLS muss auf `Full (strict)` stehen.
- In den Browser-Entwicklertools die WebSocket-Verbindung auf Fehler prüfen.

### Health-Dienste bleiben nicht konfiguriert

Die entsprechenden `*_HEALTH_URL`-Variablen im Portainer-Stack ergänzen und den
Stack redeployen. Die URLs müssen vom Server aus erreichbar sein.