import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export interface CorporateEntity {
  id: string; // 'ALL', 'SUNRISE', 'HUONG_DUONG', 'LAN_ANH' hoặc custom ID
  entityId?: number;
  name: string; // Tên pháp nhân đầy đủ
  shortName: string; // Tên ngắn gọn hiển thị
  taxCode?: string; // Mã số thuế
  type: 'ALL' | 'CORPORATE' | 'SPECIAL_CASH';
  description: string;
  badgeLabel: string;
  colorClass: string;
  isHoldingParent?: boolean;
}

export const PRESET_CORPORATE_ENTITIES: CorporateEntity[] = [
  {
    id: 'ALL',
    name: 'Tất cả doanh nghiệp (Hợp nhất)',
    shortName: 'Tất cả doanh nghiệp',
    type: 'ALL',
    description: 'Toàn bộ hệ sinh thái, hợp nhất mọi tài khoản & khoản vay',
    badgeLabel: 'Tập đoàn',
    colorClass: 'bg-slate-100 text-slate-800 border-slate-300',
  },
  {
    id: 'SUNRISE',
    entityId: 1,
    name: 'CONG TY CO PHAN XI MANG SUNRISE',
    shortName: 'Xi măng Sunrise',
    taxCode: '0109730501',
    type: 'CORPORATE',
    description: 'Đơn vị sản xuất & kinh doanh xi măng (Pháp nhân nợ chính)',
    badgeLabel: 'Pháp nhân chính',
    colorClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    isHoldingParent: true,
  },
  {
    id: 'HUONG_DUONG',
    entityId: 2,
    name: 'CONG TY CO PHAN THUONG MAI VA PHAT TRIEN HUONG DUONG',
    shortName: 'TM & PT Hướng Dương',
    taxCode: '0110176990',
    type: 'CORPORATE',
    description: 'Đơn vị thương mại, tiếp vận & phân phối vật tư',
    badgeLabel: 'Thành viên',
    colorClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    id: 'LAN_ANH',
    entityId: 3,
    name: 'NGUYEN THI LAN ANH',
    shortName: 'Bà Nguyễn Thị Lan Anh (CEO)',
    taxCode: '0109730501',
    type: 'SPECIAL_CASH',
    description: 'Tài khoản ủy quyền CEO / Kênh rút tiền mặt công ty (MBBank)',
    badgeLabel: 'Ủy quyền CEO',
    colorClass: 'bg-pink-50 text-pink-700 border-pink-200',
  },
];

interface CorporateEntityContextType {
  selectedEntity: CorporateEntity;
  setSelectedEntity: (entity: CorporateEntity) => void;
  entities: CorporateEntity[];
  selectEntityById: (id: string) => void;
  addEntity: (data: Omit<CorporateEntity, 'id'> & { id?: string }) => Promise<CorporateEntity>;
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
  openCreateModal: () => void;
  closeCreateModal: () => void;
  refreshEntities: () => Promise<void>;
}

const STORAGE_KEY = 'bsp_selected_corporate_entity_id';
const CUSTOM_ENTITIES_KEY = 'bsp_custom_corporate_entities';

const CorporateEntityContext = createContext<CorporateEntityContextType | undefined>(undefined);

export const CorporateEntityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [entities, setEntities] = useState<CorporateEntity[]>(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_ENTITIES_KEY);
      if (stored) {
        const parsed: CorporateEntity[] = JSON.parse(stored);
        const map = new Map<string, CorporateEntity>();
        PRESET_CORPORATE_ENTITIES.forEach((e) => map.set(e.id, e));
        parsed.forEach((e) => map.set(e.id, e));
        return Array.from(map.values());
      }
    } catch {
      // Ignore parse error
    }
    return PRESET_CORPORATE_ENTITIES;
  });

  const [selectedEntityId, setSelectedEntityId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || 'SUNRISE';
  });

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Sync from DB API
  const refreshEntities = useCallback(async () => {
    try {
      const res = await api.get('/corporate-entities');
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        const fromApi: CorporateEntity[] = res.data.map((item: any) => ({
          id: item.entity_code || `ENTITY_${item.entity_id}`,
          entityId: item.entity_id,
          name: item.company_name,
          shortName: item.short_name,
          taxCode: item.tax_code || undefined,
          type: item.entity_type as 'CORPORATE' | 'SPECIAL_CASH',
          description: item.description || '',
          badgeLabel: item.badge_label || (item.entity_type === 'SPECIAL_CASH' ? 'Ủy quyền CEO' : 'Thành viên'),
          colorClass: item.color_class || 'bg-indigo-50 text-indigo-700 border-indigo-200',
          isHoldingParent: item.is_holding_parent,
        }));

        const map = new Map<string, CorporateEntity>();
        // Luôn giữ 'ALL' ở đầu
        map.set('ALL', PRESET_CORPORATE_ENTITIES[0]);

        // Thêm các presets cơ bản
        PRESET_CORPORATE_ENTITIES.slice(1).forEach((e) => map.set(e.id, e));

        // Nạp từ API
        fromApi.forEach((e) => map.set(e.id, e));

        const merged = Array.from(map.values());
        setEntities(merged);

        // Lưu custom entities (ngoài presets) vào localStorage
        const customOnly = merged.filter((e) => !PRESET_CORPORATE_ENTITIES.some((p) => p.id === e.id));
        localStorage.setItem(CUSTOM_ENTITIES_KEY, JSON.stringify(customOnly));
      }
    } catch {
      // Fallback silently if offline or API not ready
    }
  }, []);

  useEffect(() => {
    refreshEntities();
  }, [refreshEntities]);

  const selectedEntity =
    entities.find((e) => e.id === selectedEntityId) ||
    entities.find((e) => e.id === 'SUNRISE') ||
    entities[0] ||
    PRESET_CORPORATE_ENTITIES[1];

  const handleSelectEntity = (entity: CorporateEntity) => {
    setSelectedEntityId(entity.id);
    localStorage.setItem(STORAGE_KEY, entity.id);
  };

  const selectEntityById = (id: string) => {
    const found = entities.find((e) => e.id === id);
    if (found) {
      setSelectedEntityId(found.id);
      localStorage.setItem(STORAGE_KEY, found.id);
    }
  };

  const addEntity = async (
    data: Omit<CorporateEntity, 'id'> & { id?: string }
  ): Promise<CorporateEntity> => {
    const generatedId =
      data.id ||
      data.shortName
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Z0-9]+/g, '_')
        .slice(0, 30) ||
      `ENT_${Date.now()}`;

    const newEntity: CorporateEntity = {
      ...data,
      id: generatedId,
    };

    // 1. Thử gửi lên API để lưu CSDL Postgres
    try {
      await api.post('/corporate-entities', {
        entity_code: newEntity.id,
        company_name: newEntity.name,
        short_name: newEntity.shortName,
        tax_code: newEntity.taxCode,
        entity_type: newEntity.type,
        is_holding_parent: false,
        description: newEntity.description,
        badge_label: newEntity.badgeLabel,
        color_class: newEntity.colorClass,
      });
    } catch (e) {
      console.warn('Could not persist corporate entity to backend, continuing locally', e);
    }

    // 2. Cập nhật state & localStorage
    setEntities((prev) => {
      const exists = prev.some((e) => e.id === newEntity.id);
      const updated = exists ? prev.map((e) => (e.id === newEntity.id ? newEntity : e)) : [...prev, newEntity];
      const customOnly = updated.filter((e) => !PRESET_CORPORATE_ENTITIES.some((p) => p.id === e.id));
      localStorage.setItem(CUSTOM_ENTITIES_KEY, JSON.stringify(customOnly));
      return updated;
    });

    // 3. Tự động chuyển ngay sang thực thể vừa tạo
    handleSelectEntity(newEntity);

    return newEntity;
  };

  return (
    <CorporateEntityContext.Provider
      value={{
        selectedEntity,
        setSelectedEntity: handleSelectEntity,
        entities,
        selectEntityById,
        addEntity,
        isCreateModalOpen,
        setIsCreateModalOpen,
        openCreateModal: () => setIsCreateModalOpen(true),
        closeCreateModal: () => setIsCreateModalOpen(false),
        refreshEntities,
      }}
    >
      {children}
    </CorporateEntityContext.Provider>
  );
};

export const useCorporateEntity = (): CorporateEntityContextType => {
  const context = useContext(CorporateEntityContext);
  if (!context) {
    throw new Error('useCorporateEntity must be used within a CorporateEntityProvider');
  }
  return context;
};
