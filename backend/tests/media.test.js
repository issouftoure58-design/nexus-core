import { describe, test, expect, jest } from '@jest/globals';

describe('Replicate Service', () => {

  test('generateImage retourne structure correcte', async () => {
    // Mock Replicate pour éviter appel API réel
    const mockRun = jest.fn().mockResolvedValue(['https://replicate.delivery/test-image.png']);

    jest.unstable_mockModule('replicate', () => ({
      default: class {
        constructor() {}
        run = mockRun;
      }
    }));

    const { generateImage } = await import('../src/services/replicateService.js');
    const result = await generateImage('Test prompt');

    expect(result.success).toBe(true);
    expect(result.url).toBeDefined();
    expect(result.model).toBe('flux-schnell');
    expect(result.prompt).toBe('Test prompt');
  });

  test('generateImageHD utilise modèle SDXL', async () => {
    const mockRun = jest.fn().mockResolvedValue(['https://replicate.delivery/test-hd.png']);

    jest.unstable_mockModule('replicate', () => ({
      default: class {
        constructor() {}
        run = mockRun;
      }
    }));

    const { generateImageHD } = await import('../src/services/replicateService.js');
    const result = await generateImageHD('HD test prompt');

    expect(result.success).toBe(true);
    expect(result.model).toBe('sdxl');
  });

  test('removeBackground retourne URL traitée', async () => {
    const mockRun = jest.fn().mockResolvedValue('https://replicate.delivery/no-bg.png');

    jest.unstable_mockModule('replicate', () => ({
      default: class {
        constructor() {}
        run = mockRun;
      }
    }));

    const { removeBackground } = await import('../src/services/replicateService.js');
    const result = await removeBackground('https://example.com/photo.jpg');

    expect(result.success).toBe(true);
    expect(result.url).toBeDefined();
    expect(result.original).toBe('https://example.com/photo.jpg');
  });

  test('upscaleImage accepte paramètre scale', async () => {
    const mockRun = jest.fn().mockResolvedValue('https://replicate.delivery/upscaled.png');

    jest.unstable_mockModule('replicate', () => ({
      default: class {
        constructor() {}
        run = mockRun;
      }
    }));

    const { upscaleImage } = await import('../src/services/replicateService.js');
    const result = await upscaleImage('https://example.com/small.jpg', 4);

    expect(result.success).toBe(true);
    expect(result.scale).toBe(4);
  });

  test('generateVideo retourne métadonnées vidéo', async () => {
    const mockRun = jest.fn().mockResolvedValue('https://replicate.delivery/video.mp4');

    jest.unstable_mockModule('replicate', () => ({
      default: class {
        constructor() {}
        run = mockRun;
      }
    }));

    const { generateVideo } = await import('../src/services/replicateService.js');
    const result = await generateVideo('https://example.com/image.png', 'high');

    expect(result.success).toBe(true);
    expect(result.fps).toBe(6);
    expect(result.duration).toBe('2-3s');
  });
});

describe('Facebook Service', () => {

  test('getAuthUrl retourne URL Facebook OAuth', async () => {
    const { getAuthUrl } = await import('../src/services/facebookService.js');
    const url = getAuthUrl();

    expect(url).toContain('facebook.com');
    expect(url).toContain('dialog/oauth');
    expect(url).toContain('pages_manage_posts');
  });
});

describe('Social Scheduler', () => {

  test('startSocialScheduler démarre sans erreur', async () => {
    const { startSocialScheduler, stopSocialScheduler } = await import('../src/services/socialScheduler.js');

    // Ne devrait pas throw même sans Supabase
    expect(() => startSocialScheduler()).not.toThrow();

    // Cleanup
    stopSocialScheduler();
  });
});

describe('Caption Generation', () => {

  test('generateSocialPost structure correcte', async () => {
    const mockRun = jest.fn().mockResolvedValue(['https://replicate.delivery/social.png']);

    jest.unstable_mockModule('replicate', () => ({
      default: class {
        constructor() {}
        run = mockRun;
      }
    }));

    const { generateSocialPost } = await import('../src/services/replicateService.js');

    const result = await generateSocialPost({
      platform: 'instagram',
      theme: 'promotion',
      text: 'Soldes -30%',
      businessType: 'salon_coiffure',
      style: 'moderne'
    });

    expect(result.success).toBe(true);
    expect(result.image).toBeDefined();
    expect(result.caption).toContain('Soldes -30%');
    expect(result.platform).toBe('instagram');
  });
});
