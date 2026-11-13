import ExamsPanel from './ExamsPanel.jsx';
import FamiliesPanel from './FamiliesPanel.jsx';
import FinancePanel from './FinancePanel.jsx';
import GradesAdminPanel from './GradesAdminPanel.jsx';
import LeadsPanel from './LeadsPanel.jsx';
import LegacySchedulesPanel from './LegacySchedulesPanel.jsx';
import SchoolPanel from './SchoolPanel.jsx';
import Tabs from './Tabs.jsx';
import UsersPanel from './UsersPanel.jsx';

// Administration, one area per tab.
export default function AdminPanel({ onUnauthorized }) {
  const tabs = [
    { id: 'interesados', label: 'Interesados', content: <LeadsPanel onUnauthorized={onUnauthorized} /> },
    {
      id: 'escuela',
      label: 'Escuela',
      content: (
        <>
          <SchoolPanel onUnauthorized={onUnauthorized} />
          <LegacySchedulesPanel onUnauthorized={onUnauthorized} />
        </>
      ),
    },
    { id: 'finanzas', label: 'Finanzas', content: <FinancePanel onUnauthorized={onUnauthorized} /> },
    {
      id: 'examenes',
      label: 'Exámenes y grados',
      content: (
        <>
          <ExamsPanel canApprove onUnauthorized={onUnauthorized} />
          <GradesAdminPanel onUnauthorized={onUnauthorized} />
        </>
      ),
    },
    {
      id: 'personas',
      label: 'Personas',
      content: (
        <>
          <FamiliesPanel onUnauthorized={onUnauthorized} />
          <UsersPanel onUnauthorized={onUnauthorized} />
        </>
      ),
    },
  ];

  return <Tabs tabs={tabs} label="Administración" />;
}
