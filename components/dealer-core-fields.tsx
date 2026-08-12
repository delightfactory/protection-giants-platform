import { FormField } from "@/components/ui/form-field";
import { FormGrid } from "@/components/ui/form-layout";

type AgentOption = {
  id: string;
  code: string;
  name: string;
  country_code: string;
};

type DealerCoreFieldValues = {
  code: string;
  name: string;
  countryAgentId: string;
};

type DealerCoreFieldsProps = {
  agents: AgentOption[];
  values?: DealerCoreFieldValues;
  lockAgent?: boolean;
};

export function DealerCoreFields({ agents, values, lockAgent = false }: DealerCoreFieldsProps) {
  const selectedAgent = agents.find((agent) => agent.id === values?.countryAgentId);

  return (
    <FormGrid>
      <FormField
        label="كود الوكيل / الموزع"
        hint="حروف إنجليزية وأرقام وشرطة أو شرطة سفلية. يتم حفظ الكود بحروف كبيرة."
      >
        <input
          name="code"
          type="text"
          minLength={2}
          maxLength={40}
          pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,39}"
          placeholder="EG-CAIRO"
          autoCapitalize="characters"
          spellCheck={false}
          dir="ltr"
          defaultValue={values?.code}
          required
        />
      </FormField>

      <FormField label="اسم الوكيل / الموزع">
        <input name="name" type="text" minLength={2} maxLength={160} defaultValue={values?.name} required />
      </FormField>

      <FormField
        label="وكيل الدولة"
        hint="الدولة تُستمد تلقائيًا من وكيل الدولة ولا تُدخل يدويًا."
      >
        {lockAgent ? (
          <>
            <input type="hidden" name="country_agent_id" value={values?.countryAgentId ?? ""} />
            <select value={values?.countryAgentId ?? ""} disabled aria-disabled="true">
              {selectedAgent ? (
                <option value={selectedAgent.id}>
                  {selectedAgent.name} ({selectedAgent.country_code})
                </option>
              ) : (
                <option value="">وكيل الدولة غير متاح</option>
              )}
            </select>
          </>
        ) : (
          <select name="country_agent_id" defaultValue={values?.countryAgentId ?? ""} required>
            <option value="" disabled>اختر وكيل الدولة</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} ({agent.country_code}) — {agent.code}
              </option>
            ))}
          </select>
        )}
      </FormField>
    </FormGrid>
  );
}
