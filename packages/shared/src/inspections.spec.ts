import { createInspectionSchema, inspectionSchema } from './index';

const validPayload = {
  name: 'Homepage availability',
  target: 'https://example.com',
  notes: 'Runs every 5 minutes',
};

describe('inspection contracts', () => {
  it('accepts a valid create payload', () => {
    const parsed = createInspectionSchema.parse(validPayload);

    expect(parsed).toEqual(validPayload);
  });

  it('rejects a payload whose target is not a URL', () => {
    const result = createInspectionSchema.safeParse({ ...validPayload, target: 'not-a-url' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['target']);
  });

  it('rejects a stored inspection without an id', () => {
    const result = inspectionSchema.safeParse({ ...validPayload, status: 'pending' });

    expect(result.success).toBe(false);
  });

  it('accepts a stored inspection', () => {
    const result = inspectionSchema.safeParse({
      ...validPayload,
      id: '3f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8',
      status: 'passed',
      createdAt: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
  });
});
