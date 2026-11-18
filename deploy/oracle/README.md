# Oracle Cloud deployment

Runs the API on an Always Free Ampere (Arm) instance with HTTPS from Caddy.

1. Create an instance: **Ubuntu 22.04 or 24.04**, shape **VM.Standard.A1.Flex** (2 OCPU, 12 GB).
2. Under **Advanced options → Management → Initialization script**, paste [`cloud-init.sh`](cloud-init.sh).
3. In the instance's **subnet → Security list**, add ingress rules for TCP ports **80** and **443** from `0.0.0.0/0`.
4. After about 10 minutes the API answers at `https://<public-ip-with-dashes>.sslip.io/api/health`.
   Set that address as `API_BASE_URL` (GitHub Pages) and `VITE_API_BASE` (Netlify).

New commits on `main` are deployed automatically every 5 minutes by `update.sh`.
Setup logs are in `/var/log/stickify-setup.log`.
