import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';

export type TreeNode = {
  label: string;
  children?: TreeNode[];
  icon?: string;
  expanded?: boolean;
  selectable?: boolean;
  data?: any;
};

export type TreeProps = BaseProps & {
  data: TreeNode[];
  onSelect?: (path: string[]) => void;
  expandable?: boolean;
  defaultExpanded?: boolean;
  showIcons?: boolean;
  indentSize?: number;
  onExpand?: (node: TreeNode, expanded: boolean) => void;
  onCollapse?: (node: TreeNode) => void;
};

export class Tree implements Component<Widgets.ListElement> {
  el: Widgets.ListElement;
  theme: any;
  destroy: () => void;
  private baseComponent: any;
  private props: TreeProps;
  private data: TreeNode[];
  private flat: { text: string; path: string[]; node: TreeNode }[] = [];
  private expandedNodes: Set<string> = new Set();

  constructor(props: TreeProps) {
    this.props = props;
    this.data = props.data;

    const comp = createBoxBase<Widgets.BoxElement>({
      ...props,
      borderStyle: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
    }, 'tree');

    // Create tree list
    const el = blessed.list({
      parent: comp.el,
      style: {
        selected: { bg: comp.theme.accent, fg: comp.theme.background },
        item: { fg: comp.theme.foreground },
      },
      keys: true,
      mouse: true,
      border: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: props.width,
      height: props.height,
      label: props.label,
    });

    this.el = el;
    this.theme = comp.theme;
    this.destroy = () => {
      el.destroy();
      comp.destroy();
    };
    this.baseComponent = comp;

    this.setupTreeData();
    this.setupEventHandlers();
  }

  // Implement required methods by delegating to base component
  setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant);
  setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
  setState = (state: ComponentState) => this.baseComponent.setState(state);
  getConfig = () => this.baseComponent.getConfig();
  update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

  private setupTreeData() {
    this.flat = [];
    this.expandedNodes.clear();

    if (this.props.defaultExpanded) {
      this.expandAllNodes(this.data);
    }

    this.flattenTree(this.data, [], 0);
    this.updateTreeDisplay();
  }

  private flattenTree(nodes: TreeNode[], path: string[], depth: number) {
    for (const node of nodes) {
      const currentPath = [...path, node.label];
      const isExpanded = this.expandedNodes.has(currentPath.join('/'));

      // Create display text
      let text = '';
      const indent = '  '.repeat(depth);

      if (this.props.showIcons && node.icon) {
        text += `${indent}${node.icon} `;
      } else {
        text += indent;
      }

      if (node.children && node.children.length > 0) {
        text += isExpanded ? '▼ ' : '▶ ';
      } else {
        text += '  ';
      }

      text += node.label;

      this.flat.push({ text, path: currentPath, node });

      // Add children if expanded
      if (isExpanded && node.children) {
        this.flattenTree(node.children, currentPath, depth + 1);
      }
    }
  }

  private updateTreeDisplay() {
    const items = this.flat.map(item => item.text);
    this.el.setItems(items);
    this.el.screen.render();
  }

  private setupEventHandlers() {
    const { onSelect, expandable = true } = this.props;

    // Handle selection
    if (onSelect) {
      this.el.on('select', (_item, index) => {
        const item = this.flat[index];
        if (item && item.node.selectable !== false) {
          onSelect(item.path);
        }
      });
    }

    // Handle expansion/collapse
    if (expandable) {
      this.el.key(['space', 'enter'], () => {
        const selectedIndex = (this.el as any).selected || 0;
        const item = this.flat[selectedIndex];
        if (item && item.node.children && item.node.children.length > 0) {
          this.toggleNode(item.path);
        }
      });
    }
  }

  private toggleNode(path: string[]) {
    const pathKey = path.join('/');
    const isExpanded = this.expandedNodes.has(pathKey);

    if (isExpanded) {
      this.collapseNode(path);
    } else {
      this.expandNode(path);
    }
  }

  private expandNode(path: string[]) {
    const pathKey = path.join('/');
    this.expandedNodes.add(pathKey);

    // Find the node and update its expanded state
    const node = this.findNodeByPath(path);
    if (node) {
      node.expanded = true;

      if (this.props.onExpand) {
        this.props.onExpand(node, true);
      }
    }

    this.setupTreeData();
  }

  private collapseNode(path: string[]) {
    const pathKey = path.join('/');
    this.expandedNodes.delete(pathKey);

    // Remove all expanded children paths
    const pathsToRemove = Array.from(this.expandedNodes).filter(p => p.startsWith(pathKey + '/'));
    pathsToRemove.forEach(p => this.expandedNodes.delete(p));

    // Find the node and update its expanded state
    const node = this.findNodeByPath(path);
    if (node) {
      node.expanded = false;

      if (this.props.onCollapse) {
        this.props.onCollapse(node);
      }
    }

    this.setupTreeData();
  }

  private findNodeByPath(path: string[]): TreeNode | null {
    let current = this.data;

    for (const label of path) {
      const found = current.find(node => node.label === label);
      if (!found || !found.children) {
        return found || null;
      }
      current = found.children;
    }

    return null;
  }

  private expandAllNodes(nodes: TreeNode[]) {
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        this.expandedNodes.add([node.label].join('/'));
        this.expandAllNodes(node.children);
      }
    }
  }

  // Method to set tree data
  setData(data: TreeNode[]) {
    this.data = data;
    this.setupTreeData();
  }

  // Method to add node
  addNode(parentPath: string[], node: TreeNode) {
    const parent = this.findNodeByPath(parentPath);
    if (parent) {
      if (!parent.children) {
        parent.children = [];
      }
      parent.children.push(node);
      this.setupTreeData();
    }
  }

  // Method to remove node
  removeNode(path: string[]) {
    if (path.length === 0) return;

    const parentPath = path.slice(0, -1);
    const nodeLabel = path[path.length - 1];

    if (parentPath.length === 0) {
      // Root level
      this.data = this.data.filter(node => node.label !== nodeLabel);
    } else {
      const parent = this.findNodeByPath(parentPath);
      if (parent && parent.children) {
        parent.children = parent.children.filter(node => node.label !== nodeLabel);
      }
    }

    this.setupTreeData();
  }

  // Method to expand node
  expand(path: string[]) {
    this.expandNode(path);
  }

  // Method to collapse node
  collapse(path: string[]) {
    this.collapseNode(path);
  }

  // Method to expand all nodes
  expandAll() {
    this.expandAllNodes(this.data);
    this.setupTreeData();
  }

  // Method to collapse all nodes
  collapseAll() {
    this.expandedNodes.clear();
    this.setupTreeData();
  }

  // Method to set node expanded state
  setNodeExpanded(path: string[], expanded: boolean) {
    if (expanded) {
      this.expandNode(path);
    } else {
      this.collapseNode(path);
    }
  }

  // Method to set node label
  setNodeLabel(path: string[], label: string) {
    const node = this.findNodeByPath(path);
    if (node) {
      node.label = label;
      this.setupTreeData();
    }
  }

  // Method to set node icon
  setNodeIcon(path: string[], icon: string) {
    const node = this.findNodeByPath(path);
    if (node) {
      node.icon = icon;
      this.setupTreeData();
    }
  }

  // Method to set node selectable
  setNodeSelectable(path: string[], selectable: boolean) {
    const node = this.findNodeByPath(path);
    if (node) {
      node.selectable = selectable;
      this.setupTreeData();
    }
  }

  // Method to set node data
  setNodeData(path: string[], data: any) {
    const node = this.findNodeByPath(path);
    if (node) {
      node.data = data;
    }
  }

  // Method to get node data
  getNodeData(path: string[]): any {
    const node = this.findNodeByPath(path);
    return node?.data;
  }

  // Method to get node by path
  getNode(path: string[]): TreeNode | null {
    return this.findNodeByPath(path);
  }

  // Method to check if node is expanded
  isNodeExpanded(path: string[]): boolean {
    const pathKey = path.join('/');
    return this.expandedNodes.has(pathKey);
  }

  // Method to check if node is selectable
  isNodeSelectable(path: string[]): boolean {
    const node = this.findNodeByPath(path);
    return node?.selectable !== false;
  }

  // Method to get expanded nodes count
  getExpandedNodesCount(): number {
    return this.expandedNodes.size;
  }

  // Method to get tree depth
  getTreeDepth(): number {
    const calculateDepth = (nodes: TreeNode[], currentDepth: number): number => {
      let maxDepth = currentDepth;
      for (const node of nodes) {
        if (node.children && node.children.length > 0) {
          maxDepth = Math.max(maxDepth, calculateDepth(node.children, currentDepth + 1));
        }
      }
      return maxDepth;
    };

    return calculateDepth(this.data, 0);
  }

  // Method to get node count
  getNodeCount(): number {
    const countNodes = (nodes: TreeNode[]): number => {
      let count = nodes.length;
      for (const node of nodes) {
        if (node.children) {
          count += countNodes(node.children);
        }
      }
      return count;
    };

    return countNodes(this.data);
  }

  // Method to find nodes by label
  findNodesByLabel(label: string): { node: TreeNode; path: string[] }[] {
    const results: { node: TreeNode; path: string[] }[] = [];

    const search = (nodes: TreeNode[], path: string[]) => {
      for (const node of nodes) {
        if (node.label === label) {
          results.push({ node, path: [...path, node.label] });
        }
        if (node.children) {
          search(node.children, [...path, node.label]);
        }
      }
    };

    search(this.data, []);
    return results;
  }

  // Method to search nodes
  searchNodes(query: string): { node: TreeNode; path: string[] }[] {
    const results: { node: TreeNode; path: string[] }[] = [];
    const lowerQuery = query.toLowerCase();

    const search = (nodes: TreeNode[], path: string[]) => {
      for (const node of nodes) {
        if (node.label.toLowerCase().includes(lowerQuery)) {
          results.push({ node, path: [...path, node.label] });
        }
        if (node.children) {
          search(node.children, [...path, node.label]);
        }
      }
    };

    search(this.data, []);
    return results;
  }

  // Static method to create tree with specific configuration
  static create(props: TreeProps): Tree {
    return new Tree(props);
  }

  // Static method to create simple tree
  static simple(data: TreeNode[], onSelect?: (path: string[]) => void): Tree {
    return new Tree({ data, onSelect });
  }

  // Static method to create expandable tree
  static expandable(data: TreeNode[], onSelect?: (path: string[]) => void): Tree {
    return new Tree({ data, onSelect, expandable: true, defaultExpanded: false });
  }
}


