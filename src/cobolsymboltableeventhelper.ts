import { GlobalCachesHelper } from "./globalcachehelper";
import { COBOLToken, COBOLTokenStyle, ICOBOLSourceScanner, ICOBOLSourceScannerEvents } from "./cobolsourcescanner";
import { ICOBOLSettings } from './iconfiguration';
import { COBOLSymbol, COBOLSymbolTable } from './cobolglobalcache';
import { COBOLSymbolTableHelper } from './cobolglobalcache_file';


export class COBOLSymbolTableEventHelper implements ICOBOLSourceScannerEvents {

    private config: ICOBOLSettings;
    private qp: ICOBOLSourceScanner | undefined;
    private st: COBOLSymbolTable | undefined;
    private parse_copybooks_for_references: boolean;

    public constructor(config: ICOBOLSettings) {
        this.config = config;
        this.parse_copybooks_for_references = config.parse_copybooks_for_references;
    }

    public start(qp: ICOBOLSourceScanner): void {
        this.qp = qp;
        this.st = new COBOLSymbolTable();
        this.st.fileName = qp.filename;
        this.st.lastModifiedTime = qp.lastModifiedTime;
    }

    public processToken(token: COBOLToken): void {
        // hident token should not be placed in the symbol table, as they from a different file
        if (token.ignoreInOutlineView) {
            return;
        }

        if (this.st === undefined) {
            return;
        }

        switch (token.tokenType) {
            case COBOLTokenStyle.Constant:
                if (this.parse_copybooks_for_references === false) {
                    this.st.variableSymbols.set(token.tokenNameLower, new COBOLSymbol(token.tokenName, token.startLine));
                }
                break;
            case COBOLTokenStyle.Variable:
                if (this.parse_copybooks_for_references === false) {
                    this.st.variableSymbols.set(token.tokenNameLower, new COBOLSymbol(token.tokenName, token.startLine));
                }
                break;
            case COBOLTokenStyle.Paragraph:
                if (this.parse_copybooks_for_references === false) {
                    this.st.labelSymbols.set(token.tokenNameLower, new COBOLSymbol(token.tokenName, token.startLine));
                }
                break;
            case COBOLTokenStyle.Section:
                if (this.parse_copybooks_for_references === false) {
                    this.st.labelSymbols.set(token.tokenNameLower, new COBOLSymbol(token.tokenName, token.startLine));
                }
                break;
            case COBOLTokenStyle.ImplicitProgramId:
                GlobalCachesHelper.addSymbol(this.st.fileName, token.tokenNameLower, token.startLine);
                break;
            case COBOLTokenStyle.ProgramId:
                GlobalCachesHelper.addSymbol(this.st.fileName, token.tokenNameLower, token.startLine);
                break;
            case COBOLTokenStyle.EntryPoint:
                GlobalCachesHelper.addSymbol(this.st.fileName, token.tokenNameLower, token.startLine);
                break;
            case COBOLTokenStyle.InterfaceId:
                GlobalCachesHelper.addClassSymbol(this.st.fileName, token.tokenName, token.startLine);
                break;
            case COBOLTokenStyle.EnumId:
                GlobalCachesHelper.addClassSymbol(this.st.fileName, token.tokenName, token.startLine);
                break;
            case COBOLTokenStyle.ClassId:
                GlobalCachesHelper.addClassSymbol(this.st.fileName, token.tokenName, token.startLine);
                break;
            case COBOLTokenStyle.MethodId:
                GlobalCachesHelper.addMethodSymbol(this.st.fileName, token.tokenName, token.startLine);
                break;
        }
    }

    public finish(): void {
        if (this.st !== undefined && this.qp !== undefined) {
            COBOLSymbolTableHelper.saveToFile(this.qp.cacheDirectory, this.st);
        }
    }
}