import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';

export type Tab = {
  id: string;
  label: string;
  render: (parent: Widgets.Node) => void;
  icon?: string;
  disabled?: boolean;
};

export type TabsProps = BaseProps & {
  tabs: Tab[];
  activeId?: string;
  onChange?: (id: string) => void;
  orientation?: 'horizontal' | 'vertical';
  tabHeight?: number;
};

export class Tabs implements Component<Widgets.BoxElement> {
  el: Widgets.BoxElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: TabsProps;
  private header!: Widgets.ListElement;
  private body!: Widgets.BoxElement;
  private tabs: Tab[];
  private activeId: string;

  constructor(props: TabsProps) {
    this.props = props;
    this.tabs = props.tabs;
    this.activeId = props.activeId || props.tabs[0]?.id || '';

    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      borderStyle: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
    }, 'tabs');

    this.el = comp.el;
    this.theme = comp.theme;
    this.destroy = comp.destroy;
    this.baseComponent = comp;

    this.setupTabStructure();
    this.renderTabs();
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant);
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
  setState = (state: ComponentState) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  private setupTabStructure() {
    const { orientation = 'horizontal', tabHeight = 3 } = this.props;
    const isHorizontal = orientation === 'horizontal';

    // Create header list
    this.header = blessed.list({
      parent: this.el,
      top: 0,
      left: 0,
      right: isHorizontal ? 0 : undefined,
      width: isHorizontal ? undefined : 20,
      height: isHorizontal ? tabHeight : undefined,
      keys: true,
      mouse: true,
      items: [],
      style: {
        selected: { bg: this.theme.accent, fg: this.theme.background },
        item: { fg: this.theme.foreground },
      },
    });

    // Create body content area
    this.body = blessed.box({
      parent: this.el,
      top: isHorizontal ? tabHeight : 0,
      left: isHorizontal ? 0 : 22,
      right: 0,
      bottom: 0,
      style: {
        bg: this.theme.background,
        fg: this.theme.foreground,
      },
    });

    // Setup header selection handler
    this.header.on('select', (_item, index) => {
      const tab = this.tabs[index];
      if (tab && !tab.disabled) {
        this.setActiveTab(tab.id);
      }
    });
  }

  private renderTabs() {
    // Set header items
    const headerItems = this.tabs.map(tab => {
      let label = tab.label;
      if (tab.icon) {
        label = `${tab.icon} ${label}`;
      }
      if (tab.disabled) {
        label = `[${label}]`;
      }
      return label;
    });

    this.header.setItems(headerItems);

    // Set initial selection
    const activeIndex = Math.max(0, this.tabs.findIndex(t => t.id === this.activeId));
    this.header.select(activeIndex);

    // Render active tab content
    this.renderActiveTabContent();
  }

  private renderActiveTabContent() {
    // Clear body content
    this.body.children.forEach(ch => ch.detach());

    // Render active tab
    const activeTab = this.tabs.find(t => t.id === this.activeId);
    if (activeTab) {
      activeTab.render(this.body);
    }

    this.el.screen.render();
  }

  // Method to set active tab
  setActiveTab(tabId: string) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (tab && !tab.disabled) {
      this.activeId = tabId;
      const index = this.tabs.findIndex(t => t.id === tabId);
      this.header.select(index);
      this.renderActiveTabContent();

      if (this.props.onChange) {
        this.props.onChange(tabId);
      }
    }
  }

  // Method to get active tab
  getActiveTab(): Tab | undefined {
    return this.tabs.find(t => t.id === this.activeId);
  }

  // Method to get active tab ID
  getActiveTabId(): string {
    return this.activeId;
  }

  // Method to set tabs
  setTabs(tabs: Tab[]) {
    this.tabs = tabs;
    this.activeId = tabs[0]?.id || '';
    this.renderTabs();
  }

  // Method to add tab
  addTab(tab: Tab) {
    this.tabs.push(tab);
    this.renderTabs();
  }

  // Method to remove tab by ID
  removeTab(tabId: string) {
    const index = this.tabs.findIndex(t => t.id === tabId);
    if (index >= 0) {
      this.tabs.splice(index, 1);

      // Adjust active tab if needed
      if (this.activeId === tabId) {
        this.activeId = this.tabs[0]?.id || '';
      }

      this.renderTabs();
    }
  }

  // Method to update tab
  updateTab(tabId: string, updates: Partial<Tab>) {
    const tab = this.tabs.find(t => t.id === tabId);
    if (tab) {
      Object.assign(tab, updates);
      this.renderTabs();
    }
  }

  // Method to set tab label
  setTabLabel(tabId: string, label: string) {
    this.updateTab(tabId, { label });
  }

  // Method to set tab icon
  setTabIcon(tabId: string, icon: string) {
    this.updateTab(tabId, { icon });
  }

  // Method to set tab disabled
  setTabDisabled(tabId: string, disabled: boolean) {
    this.updateTab(tabId, { disabled });
  }

  // Method to set orientation
  setOrientation(orientation: 'horizontal' | 'vertical') {
    this.props.orientation = orientation;
    this.setupTabStructure();
    this.renderTabs();
  }

  // Method to set tab height
  setTabHeight(height: number) {
    this.props.tabHeight = height;
    this.setupTabStructure();
    this.renderTabs();
  }

  // Method to get tab count
  getTabCount(): number {
    return this.tabs.length;
  }

  // Method to get tab by ID
  getTab(tabId: string): Tab | undefined {
    return this.tabs.find(t => t.id === tabId);
  }

  // Method to get all tabs
  getAllTabs(): Tab[] {
    return [...this.tabs];
  }

  // Method to check if tab is active
  isTabActive(tabId: string): boolean {
    return this.activeId === tabId;
  }

  // Method to check if tab is disabled
  isTabDisabled(tabId: string): boolean {
    const tab = this.tabs.find(t => t.id === tabId);
    return tab?.disabled || false;
  }

  // Method to go to next tab
  nextTab() {
    const currentIndex = this.tabs.findIndex(t => t.id === this.activeId);
    if (currentIndex >= 0) {
      const nextIndex = (currentIndex + 1) % this.tabs.length;
      const nextTab = this.tabs[nextIndex];
      if (nextTab && !nextTab.disabled) {
        this.setActiveTab(nextTab.id);
      }
    }
  }

  // Method to go to previous tab
  previousTab() {
    const currentIndex = this.tabs.findIndex(t => t.id === this.activeId);
    if (currentIndex >= 0) {
      const prevIndex = currentIndex === 0 ? this.tabs.length - 1 : currentIndex - 1;
      const prevTab = this.tabs[prevIndex];
      if (prevTab && !prevTab.disabled) {
        this.setActiveTab(prevTab.id);
      }
    }
  }

  // Method to go to first tab
  firstTab() {
    const firstTab = this.tabs.find(t => !t.disabled);
    if (firstTab) {
      this.setActiveTab(firstTab.id);
    }
  }

  // Method to go to last tab
  lastTab() {
    const lastTab = this.tabs.slice().reverse().find(t => !t.disabled);
    if (lastTab) {
      this.setActiveTab(lastTab.id);
    }
  }

  // Static method to create tabs with specific configuration
  static create(props: TabsProps): Tabs {
    return new Tabs(props);
  }

  // Static method to create simple tabs
  static simple(tabs: { id: string; label: string }[], onChange?: (id: string) => void): Tabs {
    const tabObjects = tabs.map(tab => ({
      ...tab,
      render: () => { }, // Empty render function
    }));
    return new Tabs({ tabs: tabObjects, onChange });
  }

  // Static method to create horizontal tabs
  static horizontal(tabs: Tab[], onChange?: (id: string) => void): Tabs {
    return new Tabs({ tabs, onChange, orientation: 'horizontal' });
  }
}


