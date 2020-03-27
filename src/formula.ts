import ClassOrder from './class-order'
import Collection from './collection'
import log from './log'
import NamedNode from './named-node'
import Namespace from './namespace'
import Term from './node-internal'
import Serializer from './serialize'
import Statement from './statement'
import {
  Bindings,
  GraphTermType, GraphType, IRDFLIBDataFactory, ObjectType, PredicateType, SubjectType
} from './types'
import { isStatement } from './utils/terms'
import Variable from './variable'
import {
  Indexable,
  TFIDFactoryTypes,
} from './factories/factory-types'
import { arrayToStatements } from './utils'
import Fetcher from './fetcher'
import BlankNode from './blank-node'
import rdfFactory from './factories/rdflib-data-factory'

export interface FormulaOpts {
  dataCallback?: (q: Statement) => void
  rdfArrayRemove?: (arr: Statement[], q: Statement) => void
  rdfFactory?: IRDFLIBDataFactory
}

interface BooleanMap {
  [uri: string]: boolean;
}

interface MembersMap {
  [uri: string]: Statement;
}

interface UriMap {
  [uri: string]: string;
}

/**
 * A formula, or store of RDF statements
 */
export default class Formula extends Term {
  termType: typeof GraphTermType = GraphTermType

  classOrder = ClassOrder.Graph

  /** The additional constraints */
  constraints: ReadonlyArray<any>;

  /**
   * The accompanying fetcher instance.
   *
   * Is set by the fetcher when initialized.
   */
  fetcher?: Fetcher

  initBindings: ReadonlyArray<any>

  isVar = 0

  /**
   * A namespace for the specified namespace's URI
   * @param nsuri The URI for the namespace
   */
  ns = Namespace

  optional: ReadonlyArray<any>

  /** The stored statements */
  statements: Statement[];

  /**
   * Initializes this formula
   * @constructor
   * @param statements - Initial array of statements
   * @param constraints - initial array of constraints
   * @param initBindings - initial bindings used in Query
   * @param optional - optional
   * @param opts
   * @param opts.rdfFactory - The rdf factory that should be used by the store
*/
  constructor (
    statements?: Statement[],
    constraints?: ReadonlyArray<any>,
    initBindings?: ReadonlyArray<any>,
    optional?: ReadonlyArray<any>,
    opts: FormulaOpts = {}
    ) {
    super('')
    this.statements = statements || []
    this.constraints = constraints || []
    this.initBindings = initBindings || []
    this.optional = optional || []
  }

  /** Add a statement from its parts
   * @param subject - the first part of the statement
   * @param predicate - the second part of the statement
   * @param object - the third part of the statement
   * @param graph - the last part of the statement
   */
  add (
    subject: SubjectType,
    predicate: PredicateType,
    object: ObjectType,
    graph?: GraphType
  ): number {
    return this.statements
      .push(rdfFactory.quad(subject, predicate, object, graph))
  }

  /** Add a statment object
   * @param {Statement} statement - An existing constructed statement to add
   */
  addStatement (statement: Statement): number {
    return this.statements.push(statement)
  }

  /** @deprecated use {rdfFactory.blankNode} instead */
  bnode (id?: string): BlankNode {
    return rdfFactory.blankNode(id)
  }

  /**
   * Adds all the statements to this formula
   * @param statements - A collection of statements
   */
  addAll (statements: Statement[]): void {
    statements.forEach(quad => {
      this.add(quad.subject, quad.predicate, quad.object, quad.graph)
    })
  }

  /** Follow link from one node, using one wildcard, looking for one
  *
  * For example, any(me, knows, null, profile)  - a person I know accoring to my profile .
  * any(me, knows, null, null)  - a person I know accoring to anything in store .
  * any(null, knows, me, null)  - a person who know me accoring to anything in store .
  *
  * @param s - A node to search for as subject, or if null, a wildcard
  * @param p - A node to search for as predicate, or if null, a wildcard
  * @param o - A node to search for as object, or if null, a wildcard
  * @param g - A node to search for as graph, or if null, a wildcard
  * @returns A node which match the wildcard position, or null
  */
  any(
    s?: SubjectType | null,
    p?: PredicateType | null,
    o?: ObjectType | null,
    g?: GraphType | null
  ): Term | null {
    const st = this.anyStatementMatching(s, p, o, g)
    if (st == null) {
      return null
    } else if (s == null) {
      return st.subject
    } else if (p == null) {
      return st.predicate
    } else if (o == null) {
      return st.object
    }

    return null
  }

  /**
   * Gets the value of a node that matches the specified pattern
   * @param s The subject
   * @param p The predicate
   * @param o The object
   * @param g The graph that contains the statement
   */
  anyValue(
    s?: SubjectType | null,
    p?: PredicateType | null,
    o?: ObjectType | null,
    g?: GraphType | null
  ): string | void {
    const y = this.any(s, p, o, g)
    return y ? y.value : void 0
  }

  /**
   * Gets the first JavaScript object equivalent to a node based on the specified pattern
   * @param s The subject
   * @param p The predicate
   * @param o The object
   * @param g The graph that contains the statement
   */
  anyJS(
    s?: SubjectType | null,
    p?: PredicateType | null,
    o?: ObjectType | null,
    g?: GraphType | null
  ): any {
    const y = this.any(s, p, o, g)
    return y ? Term.toJS(y) : void 0
  }

  /**
   * Gets the first statement that matches the specified pattern
   */
  anyStatementMatching(
    s?: SubjectType | null,
    p?: PredicateType | null,
    o?: ObjectType | null,
    g?: GraphType | null
  ): Statement | undefined {
    let x = this.statementsMatching(s, p, o, g, true)
    if (!x || x.length === 0) {
      return undefined
    }

    return x[0]
  }

  /**
   * Returns a unique index-safe identifier for the given term.
   *
   * Falls back to the rdflib hashString implementation if the given factory doesn't support id.
   */
  id (term: TFIDFactoryTypes): Indexable {
    return rdfFactory.id(term)
  }

  /**
   * Search the Store
   * This is really a teaching method as to do this properly you would use IndexedFormula
   *
   * @param s - A node to search for as subject, or if null, a wildcard
   * @param p - A node to search for as predicate, or if null, a wildcard
   * @param o - A node to search for as object, or if null, a wildcard
   * @param g - A node to search for as graph, or if null, a wildcard
   * @param justOne - flag - stop when found one rather than get all of them?
   * @returns {Array<Node>} - An array of nodes which match the wildcard position
   */
  statementsMatching<JustOne extends boolean = false>(
    s?: SubjectType | null,
    p?: PredicateType | null,
    o?: ObjectType | null,
    g?: GraphType | null,
    justOne?: boolean
  ): Statement[] {
    const sts = this.statements.filter(st =>
      (!s || s.equals(st.subject)) &&
      (!p || p.equals(st.predicate)) &&
      (!o || o.equals(st.object)) &&
      (!g || g.equals(st.subject))
    )

    if (justOne) {
      return sts.length === 0 ? [] : [sts[0]]
    }

    return sts
  }

  /**
   * Finds the types in the list which have no *stored* subtypes
   * These are a set of classes which provide by themselves complete
   * information -- the other classes are redundant for those who
   * know the class DAG.
   * @param types A map of the types
   */
  bottomTypeURIs (types) {
    let bots
    let bottom
    let elt
    let i
    let len
    let ref
    let subs
    let v
    bots = []
    for (let k in types) {
      if (!types.hasOwnProperty(k)) continue
      v = types[k]
      subs = this.each(
        void 0,
        rdfFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
        rdfFactory.namedNode(k)
      )
      bottom = true
      i = 0
      for (len = subs.length; i < len; i++) {
        elt = subs[i]
        ref = elt.uri
        if (ref in types) { // the subclass is one we know
          bottom = false
          break
        }
      }
      if (bottom) {
        bots[k] = v
      }
    }
    return bots
  }

  /** Creates a new collection */
  collection (): Collection {
    return new Collection()
  }

  /** Follow links from one node, using one wildcard.
  *
  * For example, each(me, knows, null, profile)  - people I know accoring to my profile .
  * each(me, knows, null, null)  - people I know accoring to anything in store .
  * each(null, knows, me, null)  - people who know me accoring to anything in store .
  *
  * @param s - A node to search for as subject, or if null, a wildcard
  * @param p - A node to search for as predicate, or if null, a wildcard
  * @param o - A node to search for as object, or if null, a wildcard
  * @param g - A node to search for as graph, or if null, a wildcard
  * @returns {Array<Node>} - An array of nodes which match the wildcard position
  */
  each(
    s?: SubjectType | null,
    p?: PredicateType | null,
    o?: ObjectType | null,
    g?: GraphType | null
  ): Term[] {
    const results: Term[] = []
    let sts = this.statementsMatching(s, p, o, g, false)
    if (s == null) {
      for (let i = 0, len = sts.length; i < len; i++) {
        results.push(sts[i].subject)
      }
    } else if (p == null) {
      for (let l = 0, len1 = sts.length; l < len1; l++) {
        results.push(sts[l].predicate)
      }
    } else if (o == null) {
      for (let m = 0, len2 = sts.length; m < len2; m++) {
        results.push(sts[m].object)
      }
    } else if (g == null) {
      for (let q = 0, len3 = sts.length; q < len3; q++) {
        results.push(sts[q].graph)
      }
    }

    return results
  }

  /**
   * Test whether this formula is equals to {other}
   * @param other - The other formula
   */
  equals(other: Formula): boolean {
    if (!other) {
      return false
    }
    return this.hashString() === other.hashString()
  }

  /**
   * For thisClass or any subclass, anything which has it is its type
   * or is the object of something which has the type as its range, or subject
   * of something which has the type as its domain
   * We don't bother doing subproperty (yet?)as it doesn't seeem to be used
   * much.
   * Get all the Classes of which we can RDFS-infer the subject is a member
   * @return a hash of URIs
   */
  findMembersNT (thisClass) {
    let len2: number
    let len4: number
    let m: number
    let members: MembersMap
    let pred: PredicateType
    let ref
    let ref1: Statement[]
    let ref2: Term[]
    let ref3: Statement[]
    let ref4: Term[]
    let ref5: Statement[]
    let seeds
    let st
    let u: number
    seeds = {}
    seeds[thisClass.toNT()] = true
    members = {}
    ref = this.transitiveClosure(seeds, rdfFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'), true)
    for (let t in ref) {
      if (!ref.hasOwnProperty(t)) continue
      ref1 = this.statementsMatching(void 0,
        rdfFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        this.fromNT(t))
      for (let i = 0, len = ref1.length; i < len; i++) {
        st = ref1[i]
        members[st.subject.toNT()] = st
      }
      ref2 = this.each(void 0,
        rdfFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#domain'),
        this.fromNT(t))
      for (let l = 0, len1 = ref2.length; l < len1; l++) {
        pred = ref2[l] as PredicateType
        ref3 = this.statementsMatching(void 0, pred)
        for (m = 0, len2 = ref3.length; m < len2; m++) {
          st = ref3[m]
          members[st.subject.toNT()] = st
        }
      }
      ref4 = this.each(void 0,
        rdfFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#range'),
        this.fromNT(t))
      for (let q = 0, len3 = ref4.length; q < len3; q++) {
        pred = ref4[q] as PredicateType
        ref5 = this.statementsMatching(void 0, pred)
        for (u = 0, len4 = ref5.length; u < len4; u++) {
          st = ref5[u]
          members[st.object.toNT()] = st
        }
      }
    }

    return members
  }

  /**
   * For thisClass or any subclass, anything which has it is its type
   * or is the object of something which has the type as its range, or subject
   * of something which has the type as its domain
   * We don't bother doing subproperty (yet?)as it doesn't seeem to be used
   * much.
   * Get all the Classes of which we can RDFS-infer the subject is a member
   * @param subject - A named node
   */
  findMemberURIs(subject: Term): UriMap {
    return this.NTtoURI(this.findMembersNT(subject))
  }

  /**
   * Get all the Classes of which we can RDFS-infer the subject is a superclass
   * Returns a hash table where key is NT of type and value is statement why we
   * think so.
   * Does NOT return terms, returns URI strings.
   * We use NT representations in this version because they handle blank nodes.
   */
  findSubClassesNT(subject: Term): { [uri: string]: boolean } {
    let types = {}
    types[subject.toNT()] = true
    return this.transitiveClosure(
      types,
      rdfFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
      true
    )
  }

  /**
   * Get all the Classes of which we can RDFS-infer the subject is a subclass
   * @param {RDFlibNamedNode} subject - The thing whose classes are to be found
   * @returns a hash table where key is NT of type and value is statement why we
   * think so.
   * Does NOT return terms, returns URI strings.
   * We use NT representations in this version because they handle blank nodes.
   */
  findSuperClassesNT(subject: Term): { [uri: string]: boolean } {
    let types = {}
    types[subject.toNT()] = true
    return this.transitiveClosure(types,
      rdfFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'), false)
  }

  /**
   * Get all the Classes of which we can RDFS-infer the subject is a member
   * todo: This will loop is there is a class subclass loop (Sublass loops are
   * not illegal)
   * @param {RDFlibNamedNode} subject - The thing whose classes are to be found
   * @returns a hash table where key is NT of type and value is statement why we think so.
   * Does NOT return terms, returns URI strings.
   * We use NT representations in this version because they handle blank nodes.
   */
  findTypesNT (subject) {
    let domain
    let range
    let rdftype
    let ref
    let ref1
    let ref2
    let ref3
    let st
    let types
    rdftype = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
    types = []
    ref = this.statementsMatching(subject, void 0, void 0)
    for (let i = 0, len = ref.length; i < len; i++) {
      st = ref[i]
      if (st.predicate.uri === rdftype) {
        types[st.object.toNT()] = st
      } else {
        ref1 = this.each(
          st.predicate,
          rdfFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#domain')
        )
        for (let l = 0, len1 = ref1.length; l < len1; l++) {
          range = ref1[l]
          types[range.toNT()] = st
        }
      }
    }
    ref2 = this.statementsMatching(void 0, void 0, subject)
    for (let m = 0, len2 = ref2.length; m < len2; m++) {
      st = ref2[m]
      ref3 = this.each(
        st.predicate,
        rdfFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#range')
      )
      for (let q = 0, len3 = ref3.length; q < len3; q++) {
        domain = ref3[q]
        types[domain.toNT()] = st
      }
    }
    return this.transitiveClosure(
      types,
      rdfFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
      false
    )
  }

  /**
   * Get all the Classes of which we can RDFS-infer the subject is a member
   * todo: This will loop is there is a class subclass loop (Sublass loops are
   * not illegal)
   * Returns a hash table where key is NT of type and value is statement why we
   * think so.
   * Does NOT return terms, returns URI strings.
   * We use NT representations in this version because they handle blank nodes.
   * @param subject - A subject node
   */
  findTypeURIs(subject: SubjectType): UriMap {
    return this.NTtoURI(this.findTypesNT(subject))
  }

  /** Trace statements which connect directly, or through bnodes
   *
   * @param subject - The node to start looking for statments
   * @param doc - The document to be searched, or null to search all documents
   * @returns an array of statements, duplicate statements are suppresssed.
   */
  connectedStatements(
    subject: SubjectType,
    doc: GraphType,
    excludePredicateURIs?: ReadonlyArray<string>
  ): Statement[] {
    excludePredicateURIs = excludePredicateURIs || []
    let todo = [subject]
    let done: { [k: string]: boolean } = {}
    let doneArcs: { [k: string]: boolean }  = {}
    let result: Statement[] = []
    let self = this
    let follow = function (x) {
      let queue = function (x) {
        if (x.termType === 'BlankNode' && !done[x.value]) {
          done[x.value] = true
          todo.push(x)
        }
      }
      let sts = self.statementsMatching(null, null, x, doc)
        .concat(self.statementsMatching(x, null, null, doc))
      sts = sts.filter(function (st): boolean {
        if (excludePredicateURIs![st.predicate.value]) return false
        let hash = (st as Statement).toNT()
        if (doneArcs[hash]) return false
        doneArcs[hash] = true
        return true
      }
      )
      sts.forEach(function (st) {
        queue(st.subject)
        queue(st.object)
      })
      result = result.concat(sts)
    }
    while (todo.length) {
      follow(todo.shift())
    }
    // console.log('' + result.length + ' statements about ' + subject)
    return result
  }

  /**
   * Creates a new empty formula
   *
   * @param _features - Not applicable, but necessary for typing to pass
   */
  formula(_features?: ReadonlyArray<string>): Formula {
    return new Formula()
  }

  /**
   * Transforms an NTriples string format into a Term.
   * The blank node bit should not be used on program-external values; designed
   * for internal work such as storing a blank node id in an HTML attribute.
   * This will only parse the strings generated by the various toNT() methods.
   */
  fromNT (str) {
    let dt, k, lang
    switch (str[0]) {
      case '<':
        return this.sym(str.slice(1, -1))
      case '"':
        lang = void 0
        dt = void 0
        k = str.lastIndexOf('"')
        if (k < str.length - 1) {
          if (str[k + 1] === '@') {
            lang = str.slice(k + 2)
          } else if (str.slice(k + 1, k + 3) === '^^') {
            dt = this.fromNT(str.slice(k + 3))
          } else {
            throw new Error("Can't convert string from NT: " + str)
          }
        }
        str = str.slice(1, k)
        str = str.replace(/\\"/g, '"')
        str = str.replace(/\\n/g, '\n')
        str = str.replace(/\\\\/g, '\\')
        return rdfFactory.literal(str, lang || dt)
      case '_':
        return rdfFactory.blankNode(str.slice(2))
      case '?':
        return new Variable(str.slice(1))
    }
    throw new Error("Can't convert from NT: " + str)
  }

  /** Returns true if this formula holds the specified statement(s) */
  holds (s: any | any[], p?, o?, g?): boolean {
    let i
    if (arguments.length === 1) {
      if (!s) {
        return true
      }
      if (s instanceof Array) {
        for (i = 0; i < s.length; i++) {
          if (!this.holds(s[i])) {
            return false
          }
        }
        return true
      } else if (isStatement(s)) {
        return this.holds(s.subject, s.predicate, s.object, s.graph)
      } else if (s.statements) {
        return this.holds(s.statements)
      }
    }

    let st = this.anyStatementMatching(s, p, o, g)
    return st != null
  }

  /**
   * Returns true if this formula holds the specified {statement}
   */
  holdsStatement (statement) {
    return this.holds(
      statement.subject,
      statement.predicate,
      statement.object,
      statement.graph,
    )
  }

  /**
   * Used by the n3parser to generate list elements
   * @param values - The values of the collection
   * @param context - The store
   * @return {BlankNode|Collection} - The term for the statement
   */
  list (values, context) {
    if (context.rdfFactory.supports["COLLECTIONS"]) {
      const collection = context.rdfFactory.collection()
      values.forEach(function (val) {
        collection.append(val)
      })
      return collection
    } else {
      const node = context.rdfFactory.blankNode()
      const statements = arrayToStatements(node, values)
      context.addAll(statements)
      return node
    }
  }

  /**
   * Transform a collection of NTriple URIs into their URI strings
   * @param t - Some iterable collection of NTriple URI strings
   * @return A collection of the URIs as strings
   * todo: explain why it is important to go through NT
   */
  NTtoURI (t) {
    let k, v
    let uris = {}
    for (k in t) {
      if (!t.hasOwnProperty(k)) continue
      v = t[k]
      if (k[0] === '<') {
        uris[k.slice(1, -1)] = v
      }
    }
    return uris
  }

  /**
   * Serializes this formula
   * @param base - The base string
   * @param contentType - The content type of the syntax to use
   * @param provenance - The provenance URI
   */
  serialize (base, contentType, provenance) {
    let documentString
    let sts
    let sz
    sz = Serializer(this)
    sz.suggestNamespaces(this.ns)
    sz.setBase(base)
    if (provenance) {
      sts = this.statementsMatching(void 0, void 0, void 0, provenance)
    } else {
      sts = this.statements
    }
    switch (
    contentType != null ? contentType : 'text/n3') {
      case 'application/rdf+xml':
        documentString = sz.statementsToXML(sts)
        break
      case 'text/n3':
      case 'text/turtle':
        documentString = sz.statementsToN3(sts)
        break
      default:
        throw new Error('serialize: Content-type ' + contentType +
          ' not supported.')
    }
    return documentString
  }

  /**
   * Creates a new formula with the substituting bindings applied
   * @param bindings - The bindings to substitute
   */
  //@ts-ignore signature not compatible with Node
  substitute(bindings: Bindings): Formula {
    let statementsCopy = this.statements.map(function (ea) {
      return (ea as Statement).substitute(bindings)
    })
    console.log('Formula subs statmnts:' + statementsCopy)
    const y = new Formula()
    y.addAll(statementsCopy as Statement[])
    console.log('indexed-form subs formula:' + y)
    return y
  }

  /**
   * @deprecated use {rdfFactory.namedNode} instead
   */
  sym (uri: string, name?): NamedNode {
    if (name) {
      throw new Error('This feature (kb.sym with 2 args) is removed. Do not assume prefix mappings.')
    }
    return rdfFactory.namedNode(uri)
  }

  /**
   * Gets the node matching the specified pattern. Throws when no match could be made.
   * @param s - The subject
   * @param p - The predicate
   * @param o - The object
   * @param g - The graph that contains the statement
   */
  the (
    s?: SubjectType | null,
    p?: PredicateType | null,
    o?: ObjectType | null,
    g?: GraphType | null
  ): Term | null | undefined {
    let x = this.any(s, p, o, g)
    if (x == null) {
      log.error('No value found for the() {' + s + ' ' + p + ' ' + o + '}.')
    }

    return x
  }

  /**
   * RDFS Inference
   * These are hand-written implementations of a backward-chaining reasoner
   * over the RDFS axioms.
   * @param seeds - A hash of NTs of classes to start with
   * @param predicate - The property to trace though
   * @param inverse - Trace inverse direction
   */
  transitiveClosure(
    seeds: BooleanMap,
    predicate: PredicateType,
    inverse?: boolean
  ): {
    [uri: string]: boolean;
  } {
    let elt, i, len, s, sups, t
    let agenda = {}
    Object.assign(agenda, seeds)  // make a copy
    let done = {}  // classes we have looked up
    while (true) {
      t = (function () {
        for (let p in agenda) {
          if (!agenda.hasOwnProperty(p)) continue
          return p
        }
      })()
      if (t == null) {
        return done
      }
      sups = inverse ?
        this.each(void 0, predicate, this.fromNT(t))
        : this.each(this.fromNT(t) as PredicateType, predicate)
      for (i = 0, len = sups.length; i < len; i++) {
        elt = sups[i]
        s = elt.toNT()
        if (s in done) {
          continue
        }
        if (s in agenda) {
          continue
        }
        agenda[s] = agenda[t]
      }
      done[t] = agenda[t]
      delete agenda[t]
    }
  }

  /**
   * Finds the types in the list which have no *stored* supertypes
   * We exclude the universal class, owl:Things and rdf:Resource, as it is
   * information-free.
   * @param types - The types
   */
  topTypeURIs(types: {
    [id: string]: string | NamedNode;
  }): {
    [id: string]: string | NamedNode;
  } {
    let i
    let j
    let k
    let len
    let n
    let ref
    let tops
    let v
    tops = []
    for (k in types) {
      if (!types.hasOwnProperty(k)) continue
      v = types[k]
      n = 0
      ref = this.each(
        rdfFactory.namedNode(k),
        rdfFactory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf')
      )
      for (i = 0, len = ref.length; i < len; i++) {
        j = ref[i]
        if (j.uri !== 'http://www.w3.org/2000/01/rdf-schema#Resource') {
          n++
          break
        }
      }
      if (!n) {
        tops[k] = v
      }
    }
    if (tops['http://www.w3.org/2000/01/rdf-schema#Resource']) {
      delete tops['http://www.w3.org/2000/01/rdf-schema#Resource']
    }
    if (tops['http://www.w3.org/2002/07/owl#Thing']) {
      delete tops['http://www.w3.org/2002/07/owl#Thing']
    }
    return tops
  }

  /**
   * Serializes this formula to a string
   */
  toString(): string {
    return '{' + this.statements.join('\n') + '}'
  }

  /**
   * Gets a new variable
   * @param name - The variable's name
   */
  public variable(name: string): Variable {
    return new Variable(name)
  }

  /**
   * Gets the number of statements in this formula that matches the specified pattern
   * @param s - The subject
   * @param p - The predicate
   * @param o - The object
   * @param g - The graph that contains the statement
   */
  whether(
    s?: SubjectType | null,
    p?: PredicateType | null,
    o?: ObjectType | null,
    g?: GraphType | null
  ): number {
    return this.statementsMatching(s, p, o, g, false).length
  }
}