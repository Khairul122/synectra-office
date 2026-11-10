import { createRoot } from 'react-dom/client';
import { OfficeSpikeView } from '../../src/office3d/OfficeSpikeView';

// Visual test fixture shares the production component and has no business services.
export function mountOffice() {
  document.body.innerHTML = '<div id="root"></div>';
  createRoot(document.getElementById('root')!).render(
    <OfficeSpikeView serverHealth="Uji visual" whatsappStatus="unpaired" communicationPanel={null} />
  );
}
