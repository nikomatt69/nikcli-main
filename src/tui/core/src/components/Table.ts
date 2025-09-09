import blessed, { Widgets } from 'blessed';
import { BaseProps, Component, createBoxBase } from './BaseComponent';
import { ComponentVariant, ComponentSize, ComponentState } from '../theming/design-tokens';
import { resolveTheme } from '../theming/theme';

export type TableProps = BaseProps & {
    headers: string[];
    rows: (string | number)[][];
    sortable?: boolean;
    sortColumn?: number;
    sortDirection?: 'asc' | 'desc';
    onSort?: (column: number, direction: 'asc' | 'desc') => void;
    onRowClick?: (rowIndex: number, rowData: (string | number)[]) => void;
    selectable?: boolean;
    selectedRow?: number;
    onRowSelect?: (rowIndex: number, rowData: (string | number)[]) => void;
};

export class Table implements Component<Widgets.TableElement> {
    el: Widgets.TableElement;
    theme: any;
    destroy: () => void;
    private baseComponent: any;
    private props: TableProps;
    private headers: string[];
    private rows: (string | number)[][];
    private sortColumn: number;
    private sortDirection: 'asc' | 'desc';
    private selectedRow: number;

    constructor(props: TableProps) {
        this.props = props;
        this.headers = props.headers;
        this.rows = props.rows;
        this.sortColumn = props.sortColumn ?? -1;
        this.sortDirection = props.sortDirection ?? 'asc';
        this.selectedRow = props.selectedRow ?? -1;

        const comp = createBoxBase<Widgets.BoxElement>({
            ...props,
            borderStyle: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
        }, 'table');

        // Create table element
        const el = blessed.table({
            parent: comp.el,
            data: this.getTableData(),
            keys: props.keys ?? true,
            mouse: props.mouse ?? true,
            style: {
                ...comp.theme,
                header: { fg: comp.theme.accent, bold: true },
                cell: { fg: comp.theme.foreground },
                selected: { bg: comp.theme.accent, fg: comp.theme.background },
            },
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: props.width,
            height: props.height,
            label: props.label,
            border: props.borderStyle && props.borderStyle !== 'none' ? 'line' : undefined,
        });

        this.el = el;
        this.theme = comp.theme;
        this.destroy = () => {
            el.destroy();
            comp.destroy();
        };
        this.baseComponent = comp;

        this.setupEventHandlers();
    }

    // Implement required methods by delegating to base component
    setVariant = (variant: ComponentVariant) => this.baseComponent.setVariant(variant);
    setSize = (size: ComponentSize) => this.baseComponent.setSize(size);
    setState = (state: ComponentState) => this.baseComponent.setState(state);
    getConfig = () => this.baseComponent.getConfig();
    update = (props: Partial<BaseProps>) => this.baseComponent.update(props);

    private getTableData(): string[][] {
        const data = [this.headers, ...this.rows.map(row => row.map(String))];

        // Apply sorting if specified
        if (this.sortColumn >= 0 && this.sortColumn < this.headers.length) {
            const sortedRows = [...this.rows].sort((a, b) => {
                const aVal = a[this.sortColumn];
                const bVal = b[this.sortColumn];

                if (typeof aVal === 'string' && typeof bVal === 'string') {
                    return this.sortDirection === 'asc' ?
                        aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
                } else {
                    const aNum = Number(aVal);
                    const bNum = Number(bVal);
                    return this.sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
                }
            });

            return [this.headers, ...sortedRows.map(row => row.map(String))];
        }

        return data;
    }

    private setupEventHandlers() {
        const { onRowClick, onRowSelect, selectable } = this.props;

        // Handle row click
        if (onRowClick) {
            this.el.on('select', (_item, index) => {
                const rowIndex = index - 1; // Adjust for header
                if (rowIndex >= 0 && rowIndex < this.rows.length) {
                    onRowClick(rowIndex, this.rows[rowIndex]);
                }
            });
        }

        // Handle row selection
        if (selectable && onRowSelect) {
            this.el.on('select', (_item, index) => {
                const rowIndex = index - 1; // Adjust for header
                if (rowIndex >= 0 && rowIndex < this.rows.length) {
                    this.selectedRow = rowIndex;
                    onRowSelect(rowIndex, this.rows[rowIndex]);
                    this.updateTableDisplay();
                }
            });
        }

        // Handle sorting if enabled
        if (this.props.sortable) {
            this.el.key(['s'], () => {
                this.toggleSort();
            });
        }
    }

    private updateTableDisplay() {
        this.el.setData(this.getTableData());

        // Note: Blessed TableElement doesn't support selection highlighting
        // Selection state is maintained internally for callback purposes

        this.el.screen.render();
    }

    private toggleSort() {
        if (this.sortColumn === -1) {
            this.sortColumn = 0;
            this.sortDirection = 'asc';
        } else if (this.sortDirection === 'asc') {
            this.sortDirection = 'desc';
        } else {
            this.sortColumn = (this.sortColumn + 1) % this.headers.length;
            this.sortDirection = 'asc';
        }

        if (this.props.onSort) {
            this.props.onSort(this.sortColumn, this.sortDirection);
        }

        this.updateTableDisplay();
    }

    // Method to set table data
    setData(headers: string[], rows: (string | number)[][]) {
        this.headers = headers;
        this.rows = rows;
        this.updateTableDisplay();
    }

    // Method to set headers
    setHeaders(headers: string[]) {
        this.headers = headers;
        this.updateTableDisplay();
    }

    // Method to set rows
    setRows(rows: (string | number)[][]) {
        this.rows = rows;
        this.updateTableDisplay();
    }

    // Method to add row
    addRow(row: (string | number)[]) {
        this.rows.push(row);
        this.updateTableDisplay();
    }

    // Method to remove row by index
    removeRow(index: number) {
        if (index >= 0 && index < this.rows.length) {
            this.rows.splice(index, 1);

            // Adjust selected row
            if (this.selectedRow === index) {
                this.selectedRow = -1;
            } else if (this.selectedRow > index) {
                this.selectedRow--;
            }

            this.updateTableDisplay();
        }
    }

    // Method to update row
    updateRow(index: number, row: (string | number)[]) {
        if (index >= 0 && index < this.rows.length) {
            this.rows[index] = row;
            this.updateTableDisplay();
        }
    }

    // Method to set cell value
    setCell(rowIndex: number, colIndex: number, value: string | number) {
        if (rowIndex >= 0 && rowIndex < this.rows.length &&
            colIndex >= 0 && colIndex < this.headers.length) {
            this.rows[rowIndex][colIndex] = value;
            this.updateTableDisplay();
        }
    }

    // Method to get cell value
    getCell(rowIndex: number, colIndex: number): string | number | undefined {
        if (rowIndex >= 0 && rowIndex < this.rows.length &&
            colIndex >= 0 && colIndex < this.headers.length) {
            return this.rows[rowIndex][colIndex];
        }
        return undefined;
    }

    // Method to set sort column
    setSortColumn(column: number) {
        if (column >= -1 && column < this.headers.length) {
            this.sortColumn = column;
            this.updateTableDisplay();
        }
    }

    // Method to set sort direction
    setSortDirection(direction: 'asc' | 'desc') {
        this.sortDirection = direction;
        this.updateTableDisplay();
    }

    // Method to sort by column
    sortByColumn(column: number, direction: 'asc' | 'desc') {
        if (column >= 0 && column < this.headers.length) {
            this.sortColumn = column;
            this.sortDirection = direction;
            this.updateTableDisplay();
        }
    }

    // Method to clear sorting
    clearSort() {
        this.sortColumn = -1;
        this.sortDirection = 'asc';
        this.updateTableDisplay();
    }

    // Method to set selected row
    setSelectedRow(rowIndex: number) {
        if (rowIndex >= -1 && rowIndex < this.rows.length) {
            this.selectedRow = rowIndex;
            this.updateTableDisplay();
        }
    }

    // Method to get selected row
    getSelectedRow(): number {
        return this.selectedRow;
    }

    // Method to get selected row data
    getSelectedRowData(): (string | number)[] | undefined {
        if (this.selectedRow >= 0 && this.selectedRow < this.rows.length) {
            return this.rows[this.selectedRow];
        }
        return undefined;
    }

    // Method to set sortable
    setSortable(sortable: boolean) {
        this.props.sortable = sortable;
    }

    // Method to set selectable
    setSelectable(selectable: boolean) {
        this.props.selectable = selectable;
        if (!selectable) {
            this.selectedRow = -1;
        }
    }

    // Method to get row count
    getRowCount(): number {
        return this.rows.length;
    }

    // Method to get column count
    getColumnCount(): number {
        return this.headers.length;
    }

    // Method to get table dimensions
    getTableDimensions(): { rows: number; columns: number } {
        return {
            rows: this.rows.length,
            columns: this.headers.length,
        };
    }

    // Method to check if table is empty
    isEmpty(): boolean {
        return this.rows.length === 0;
    }

    // Method to check if column is sorted
    isColumnSorted(column: number): boolean {
        return this.sortColumn === column;
    }

    // Method to get sort info
    getSortInfo(): { column: number; direction: 'asc' | 'desc' } {
        return {
            column: this.sortColumn,
            direction: this.sortDirection,
        };
    }

    // Static method to create table with specific configuration
    static create(props: TableProps): Table {
        return new Table(props);
    }

    // Static method to create simple table
    static simple(headers: string[], rows: (string | number)[][]): Table {
        return new Table({ headers, rows });
    }

    // Static method to create sortable table
    static sortable(headers: string[], rows: (string | number)[][], onSort?: (column: number, direction: 'asc' | 'desc') => void): Table {
        return new Table({ headers, rows, sortable: true, onSort });
    }
}

