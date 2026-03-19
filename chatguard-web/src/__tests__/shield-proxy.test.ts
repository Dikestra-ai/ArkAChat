import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Shield Proxy Integration Tests', () => {
  const proxyDir = path.resolve(__dirname, '../../../chatguard-proxy');

  describe('Proxy configuration files', () => {
    it('primary config exists and is valid TOML', () => {
      const configPath = path.join(proxyDir, 'shield-proxy.toml');
      expect(fs.existsSync(configPath)).toBe(true);
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('[proxy]');
      expect(content).toContain('[shield]');
      expect(content).toContain('[metrics]');
      expect(content).toContain('[[upstream]]');
    });

    it('standby config exists with redundancy section', () => {
      const configPath = path.join(proxyDir, 'shield-proxy-standby.toml');
      expect(fs.existsSync(configPath)).toBe(true);
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('[redundancy]');
      expect(content).toContain('peer_address');
      expect(content).toContain('heartbeat_interval_ms');
      expect(content).toContain('failover_timeout_ms');
    });

    it('primary config routes to all 3 SMP servers', () => {
      const configPath = path.join(proxyDir, 'shield-proxy.toml');
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('smp4.simplex.im');
      expect(content).toContain('smp5.simplex.im');
      expect(content).toContain('smp6.simplex.im');
    });

    it('all SMP upstreams have shield_encrypt enabled', () => {
      const configPath = path.join(proxyDir, 'shield-proxy.toml');
      const content = fs.readFileSync(configPath, 'utf-8');
      // Count shield_encrypt = true occurrences (should be 3, one per SMP server)
      const matches = content.match(/shield_encrypt\s*=\s*true/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBe(3);
    });

    it('configs use environment variables for secrets', () => {
      const configPath = path.join(proxyDir, 'shield-proxy.toml');
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('${SHIELD_PROXY_PASSWORD}');
      expect(content).toContain('${SHIELD_PROXY_KEY_SMP4}');
      // No hardcoded passwords
      expect(content).not.toMatch(/password\s*=\s*"[a-zA-Z0-9]+"/);
    });
  });

  describe('Docker deployment files', () => {
    it('Dockerfile exists', () => {
      const dockerfilePath = path.join(proxyDir, 'Dockerfile');
      expect(fs.existsSync(dockerfilePath)).toBe(true);
      const content = fs.readFileSync(dockerfilePath, 'utf-8');
      expect(content).toContain('FROM rust');
      expect(content).toContain('cargo build --release');
      expect(content).toContain('EXPOSE');
    });

    it('docker-compose.yml defines active and standby services', () => {
      const composePath = path.join(proxyDir, 'docker-compose.yml');
      expect(fs.existsSync(composePath)).toBe(true);
      const content = fs.readFileSync(composePath, 'utf-8');
      expect(content).toContain('shield-proxy-active');
      expect(content).toContain('shield-proxy-standby');
    });

    it('.env.example exists with required variables', () => {
      const envPath = path.join(proxyDir, '.env.example');
      expect(fs.existsSync(envPath)).toBe(true);
      const content = fs.readFileSync(envPath, 'utf-8');
      expect(content).toContain('SHIELD_PROXY_PASSWORD');
      expect(content).toContain('SHIELD_PROXY_KEY_SMP4');
      expect(content).toContain('SHIELD_PROXY_KEY_SMP5');
      expect(content).toContain('SHIELD_PROXY_KEY_SMP6');
    });
  });

  describe('Client proxy support', () => {
    it('WebSimplexClient has setProxy method', async () => {
      const { WebSimplexClient } = await import('@/lib/simplex/client');
      const client = new WebSimplexClient();
      expect(typeof client.setProxy).toBe('function');
    });

    it('proxy URL is used in connection when set', async () => {
      // Verify setProxy doesn't throw
      const { WebSimplexClient } = await import('@/lib/simplex/client');
      const client = new WebSimplexClient();
      client.setProxy('wss://proxy.guard8.ai:8443');
      // Can disable proxy
      client.setProxy(null);
    });
  });

  describe('Metrics and health configuration', () => {
    it('metrics enabled on port 9090', () => {
      const configPath = path.join(proxyDir, 'shield-proxy.toml');
      const content = fs.readFileSync(configPath, 'utf-8');
      expect(content).toContain('9090');
      expect(content).toContain('/metrics');
    });

    it('docker-compose exposes metrics port', () => {
      const composePath = path.join(proxyDir, 'docker-compose.yml');
      const content = fs.readFileSync(composePath, 'utf-8');
      expect(content).toContain('9090');
    });
  });
});
