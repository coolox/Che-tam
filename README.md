# Project Template

Copy this directory when starting an application:

```bash
cp -a /root/projects/_template /root/projects/<app-slug>
cd /root/projects/<app-slug>
git init -b main
git add .
git commit -m "Инициализировать проект <app-slug>"
```

Then replace `docs/spec.md` with the product specification and ask Hermes to create the first task for Codex.
