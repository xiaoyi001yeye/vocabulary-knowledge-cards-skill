import './styles/app.css';
import { SchemaRepository } from './data/schema-repository';
import { ExplorerPage } from './ui/explorer-page';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing #app root');

const page = new ExplorerPage();
const repository = new SchemaRepository();
repository.loadCatalogIndex()
  .then(async (catalog) => {
    const bundle = await repository.loadLesson(catalog.defaultLessonId);
    await page.mount(root, bundle, { catalog, loadLesson: (lessonId) => repository.loadLesson(lessonId) });
  })
  .catch((error: unknown) => {
    root.innerHTML = '<main class="app-shell"><section class="error panel"><p class="eyebrow">LOAD ERROR</p><h1>无法加载知识图谱</h1><p>' + String(error) + '</p></section></main>';
  });

window.addEventListener('beforeunload', () => page.destroy());
