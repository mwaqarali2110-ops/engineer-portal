import { Plus } from 'lucide-react';
import type { BosCatalogItem, BosCategory } from '../../types/domain';

type Props = {
  categories: BosCategory[];
  onAddItem: (item: BosCatalogItem) => void;
  /** How many lines already exist per catalog item, shown as a small counter. */
  usageByItemId: Record<string, number>;
};

/** The material picker. Clicking an item appends a BOS line. */
export function BosCatalog({ categories, onAddItem, usageByItemId }: Props) {
  return (
    <div className="catalog-groups">
      {categories.map((category) => (
        <div className="catalog-group" key={category.id}>
          <div className="catalog-group-head">
            <h3>{category.title}</h3>
            <p>{category.description}</p>
          </div>
          <div className="catalog-chips">
            {category.items
              .filter((item) => item.active)
              .map((item) => {
                const used = usageByItemId[item.id] ?? 0;
                return (
                  <button
                    type="button"
                    key={item.id}
                    className="catalog-chip"
                    onClick={() => onAddItem(item)}
                  >
                    <Plus size={14} />
                    <span>{item.name}</span>
                    {used > 0 ? <em>{used}</em> : null}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
