// Export utilities for dashboard data

export const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) return;

    // Get headers from first object
    const headers = Object.keys(data[0]);

    // Create CSV content
    const csvContent = [
        headers.join(','),
        ...data.map(row =>
            headers.map(header => {
                const value = row[header];
                // Escape commas and quotes
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            }).join(',')
        )
    ].join('\n');

    // Download
    downloadFile(csvContent, `${filename}.csv`, 'text/csv;charset=utf-8;');
};

export const exportToJSON = (data: any, filename: string) => {
    const jsonContent = JSON.stringify(data, null, 2);
    downloadFile(jsonContent, `${filename}.json`, 'application/json');
};

export const exportChartAsImage = async (chartElement: HTMLElement, filename: string) => {
    try {
        // Use html2canvas if available
        const html2canvas = (window as any).html2canvas;
        if (!html2canvas) {
            console.error('html2canvas not loaded');
            return;
        }

        const canvas = await html2canvas(chartElement, {
            backgroundColor: '#ffffff',
            scale: 2 // Higher quality
        });

        canvas.toBlob((blob: Blob | null) => {
            if (blob) {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${filename}.png`;
                link.click();
                URL.revokeObjectURL(url);
            }
        });
    } catch (error) {
        console.error('Failed to export chart:', error);
    }
};

export const generatePDFReport = async (data: {
    title: string;
    kpis: Array<{ label: string; value: string }>;
    charts: Array<{ title: string; element: HTMLElement }>;
}) => {
    // This would require jsPDF library
    console.log('PDF generation would be implemented here with jsPDF');
    console.log('Report data:', data);

    // Placeholder implementation
    alert('PDF export feature coming soon! For now, use browser print (Ctrl+P)');
};

// Helper function to download file
const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

// Format data for export
export const formatDataForExport = (
    stores: any[],
    dataType: 'sales' | 'customers'
) => {
    return stores.map(store => ({
        'Store Name': store.name,
        'Region': store.region || 'N/A',
        'Prefecture': store.prefecture || 'N/A',
        'Block': store.block || 'N/A',
        'Opening Date': store.dates[0] || 'N/A',
        'Age (months)': store.raw.length,
        'Status': store.isActive ? 'Active' : 'Inactive',
        'Last Year Sales': store.stats?.lastYearSales?.toFixed(0) || '0',
        'CAGR (%)': ((store.stats?.cagr || 0) * 100).toFixed(2),
        'ABC Rank': store.stats?.abcRank || 'N/A',
        'Capacity (L)': store.params.L.toFixed(0),
        'Growth Rate (k)': store.params.k.toFixed(4),
        'Seasonality Strength': (Math.max(...store.seasonal) - Math.min(...store.seasonal)).toFixed(3)
    }));
};
