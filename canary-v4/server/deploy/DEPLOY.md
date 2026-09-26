# Hearth Canary v4 server deploy notes

These are versioned templates only. Do not put real secrets in this directory.

Expected local secret/config file:

```sh
/root/canary-data/secrets.env
```

Required variable names:

```sh
CANARY_KEY=replace-with-local-secret
CANARY_TURN_HOST=vmi3376157.contaboserver.net
CANARY_TURN_AUTH_SECRET=replace-with-local-secret
CANARY_TURN_TTL_SEC=600
```

Install service templates:

```sh
sudo install -m 0644 canary-v4/server/deploy/hearth-canary-v4.service /etc/systemd/system/hearth-canary-v4.service
sudo install -m 0644 canary-v4/server/deploy/hearth-canary-v4-udp-echo.service /etc/systemd/system/hearth-canary-v4-udp-echo.service
sudo systemctl daemon-reload
sudo systemctl enable --now hearth-canary-v4.service hearth-canary-v4-udp-echo.service
```

Create a real coturn config outside git by substituting the placeholders in
`turnserver.conf.template`. Use the same LetsEncrypt certificate paths used by
the HTTPS endpoint, for example:

```sh
/etc/letsencrypt/live/vmi3376157.contaboserver.net/fullchain.pem
/etc/letsencrypt/live/vmi3376157.contaboserver.net/privkey.pem
```

Local checks after installation:

```sh
systemctl status hearth-canary-v4.service hearth-canary-v4-udp-echo.service
curl -fsS http://127.0.0.1:9999/hearth-canary/
printf ping | nc -u -w1 127.0.0.1 9999
```
