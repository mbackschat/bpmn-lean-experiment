import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type { RowData } from "@tanstack/react-table";
import type { ReactNode } from "react";

import styles from "./data-table.module.css";

const features = tableFeatures({});

export type DataTableColumn<Row extends RowData> = Readonly<{
  id: string;
  header: ReactNode;
  responsiveLabel: string;
  cell: (row: Row) => ReactNode;
}>;

export type DataTableProps<Row extends RowData> = Readonly<{
  "aria-label": string;
  rows: readonly Row[];
  columns: readonly DataTableColumn<Row>[];
  rowId: (row: Row) => string;
}>;

/** Native table semantics backed by TanStack's headless row and cell model. */
export function DataTable<Row extends RowData>({
  "aria-label": ariaLabel,
  rows,
  columns,
  rowId,
}: DataTableProps<Row>) {
  const helper = createColumnHelper<typeof features, Row>();
  const table = useTable({
    features,
    data: [...rows],
    columns: columns.map((column) => helper.display({
      id: column.id,
      header: () => column.header,
      cell: (context) => column.cell(context.row.original),
    })),
    getRowId: rowId,
  });
  return (
    <div className={styles.collection!} data-ui="data-table-collection">
      <table className={styles.table!} data-ui="data-table" aria-label={ariaLabel}>
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => (
                <th key={header.id} scope="col">
                  {header.isPlaceholder
                    ? null
                    : <table.FlexRender header={header} />}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id}>
              {row.getAllCells().map((cell) => (
                <td
                  key={cell.id}
                  data-label={columns.find(({ id }) => id === cell.column.id)!
                    .responsiveLabel}
                >
                  <table.FlexRender cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
