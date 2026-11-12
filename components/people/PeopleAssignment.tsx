import type { Item } from "@/lib/totals";
import { fmt } from "@/lib/money";
import { Card, Chip, Label, inputCls } from "../ui";

export type Person = { name: string; email: string; isPayer: boolean };

type PeopleAssignmentProps = {
  people: Person[];
  namedPeople: string[];
  items: Item[];
  assign: Record<string, string[]>;
  equalSplit: boolean;
  peopleError: string | null;
  onToggleEqualSplit: () => void;
  onNameChange: (index: number, name: string) => void;
  onEmailChange: (index: number, email: string) => void;
  onRemovePerson: (index: number) => void;
  onAddPerson: () => void;
  onToggleItem: (itemId: string, name: string) => void;
  assignedCount: number;
};

export function PeopleAssignment({
  people,
  namedPeople,
  items,
  assign,
  equalSplit,
  peopleError,
  onToggleEqualSplit,
  onNameChange,
  onEmailChange,
  onRemovePerson,
  onAddPerson,
  onToggleItem,
  assignedCount,
}: PeopleAssignmentProps) {
  return (
    <>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <Label>PEOPLE ({namedPeople.length})</Label>
          <button
            type="button"
            role="switch"
            aria-checked={equalSplit}
            aria-label="Split equally"
            disabled={peopleError !== null || items.length === 0}
            className={`relative h-7 w-12 shrink-0 rounded-full p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${equalSplit ? "bg-[#2188E8]" : "bg-slate-300"}`}
            onClick={onToggleEqualSplit}
          >
            <span aria-hidden="true" className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${equalSplit ? "translate-x-5" : "translate-x-0"}`} />
          </button>
        </div>
        <div className="mb-1 text-right text-xs text-slate-500">Split equally</div>
        {people.map((person, index) => (
          <div key={index} className="flex items-center gap-2 border-b border-slate-200 py-2 last:border-b-0">
            <input aria-label="Name" placeholder={person.isPayer ? "Your name" : "Person's name"} className={`${inputCls} w-24 font-semibold`} value={person.name} onChange={(event) => onNameChange(index, event.target.value)} />
            {person.isPayer ? (
              <span className="text-sm text-slate-600">paid the bill</span>
            ) : (
              <>
                <input aria-label={`${person.name} email`} type="email" placeholder="PayPal email" className={`${inputCls} flex-1 text-sm`} value={person.email} onChange={(event) => onEmailChange(index, event.target.value)} />
                <button type="button" aria-label={`Remove ${person.name || "person"}`} className="shrink-0 px-1 text-lg text-slate-500" onClick={() => onRemovePerson(index)}>
                  ×
                </button>
              </>
            )}
          </div>
        ))}
        <div className="py-2">
          <button type="button" className="text-sm font-semibold text-[#0B3FA8]" onClick={onAddPerson}>
            + Add person
          </button>
        </div>
      </Card>
      <Card>
        {items.map((item) => (
          <div key={item.id} className="border-b border-slate-200 py-3 last:border-b-0">
            <div className="mb-2 flex justify-between text-[15px]">
              <span>{item.name}</span>
              <span>{fmt(item.priceCents)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {namedPeople.map((name) => (
                <Chip key={name} tone={(assign[item.id] ?? []).includes(name) ? "solid" : "blue"} pressed={(assign[item.id] ?? []).includes(name)} onClick={equalSplit ? undefined : () => onToggleItem(item.id, name)}>
                  {name}
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </Card>
      <div>
        <Chip tone={assignedCount === items.length ? "green" : "blue"}>
          {assignedCount} of {items.length} items assigned
        </Chip>
      </div>
    </>
  );
}
