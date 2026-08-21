import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const updateSettingsSchema = z.union([
  z.record(z.string(), z.any()),
  z.object({
    settings: z.record(z.string(), z.any()),
  }),
  z.object({
    items: z.array(
      z.object({
        key: z.string().min(1, 'Ayar anahtarı zorunludur.'),
        value: z.any(),
        type: z.string().optional(),
        description: z.string().optional(),
      })
    ),
  }),
]);

function parseSettingValue(value: string, type?: string | null): any {
  if (!value) return value;
  try {
    if (type === 'json' || value.startsWith('{') || value.startsWith('[')) {
      return JSON.parse(value);
    }
    if (type === 'boolean' || value === 'true' || value === 'false') {
      return value === 'true';
    }
    if (type === 'number' && !isNaN(Number(value))) {
      return Number(value);
    }
  } catch {
    return value;
  }
  return value;
}

function serializeSettingValue(value: any): { stringValue: string; type: string } {
  if (typeof value === 'object' && value !== null) {
    return { stringValue: JSON.stringify(value), type: 'json' };
  }
  if (typeof value === 'boolean') {
    return { stringValue: String(value), type: 'boolean' };
  }
  if (typeof value === 'number') {
    return { stringValue: String(value), type: 'number' };
  }
  return { stringValue: String(value ?? ''), type: 'text' };
}

export async function GET() {
  try {
    const settingsList = await db.setting.findMany({
      orderBy: { key: 'asc' },
    });

    const settingsMap: Record<string, any> = {};
    settingsList.forEach((setting) => {
      settingsMap[setting.key] = parseSettingValue(setting.value, setting.type);
    });

    return NextResponse.json({
      success: true,
      data: settingsMap,
      raw: settingsList,
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Ayarlar getirilirken bir hata oluştu.',
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = updateSettingsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          message: 'Geçersiz ayar verisi.',
          errors: validation.error.format(),
        },
        { status: 400 }
      );
    }

    const data = validation.data;
    const updates: Array<{ key: string; value: string; type: string; description?: string }> = [];

    if ('items' in data && Array.isArray(data.items)) {
      data.items.forEach((item) => {
        const { stringValue, type } = serializeSettingValue(item.value);
        updates.push({
          key: item.key,
          value: stringValue,
          type: item.type || type,
          description: item.description,
        });
      });
    } else {
      const settingsObj = 'settings' in data ? data.settings : data;
      Object.entries(settingsObj).forEach(([key, val]) => {
        const { stringValue, type } = serializeSettingValue(val);
        updates.push({
          key,
          value: stringValue,
          type,
        });
      });
    }

    if (updates.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'Güncellenecek ayar bulunamadı.',
        },
        { status: 400 }
      );
    }

    await db.$transaction(
      updates.map((update) =>
        db.setting.upsert({
          where: { key: update.key },
          update: {
            value: update.value,
            type: update.type,
            ...(update.description ? { description: update.description } : {}),
          },
          create: {
            key: update.key,
            value: update.value,
            type: update.type,
            description: update.description || null,
          },
        })
      )
    );

    const updatedSettings = await db.setting.findMany();
    const settingsMap: Record<string, any> = {};
    updatedSettings.forEach((setting) => {
      settingsMap[setting.key] = parseSettingValue(setting.value, setting.type);
    });

    return NextResponse.json({
      success: true,
      message: 'Ayarlar başarıyla güncellendi.',
      data: settingsMap,
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Ayarlar güncellenirken bir hata oluştu.',
      },
      { status: 500 }
    );
  }
}
